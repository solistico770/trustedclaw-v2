import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/require-admin";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const { id } = await params;

  const db = createServiceClient();

  // Find all cases this entity belongs to
  const { data: entityCases } = await db
    .from("case_entities")
    .select("case_id, cases(id, case_number, title, status)")
    .eq("entity_id", id);

  if (!entityCases || entityCases.length === 0) {
    return NextResponse.json({ connections: [] });
  }

  const caseIds = entityCases.map(ec => ec.case_id);

  // Find all other entities in those cases
  const { data: coEntities } = await db
    .from("case_entities")
    .select("entity_id, case_id, entities(id, canonical_name, type, phone, email)")
    .in("case_id", caseIds)
    .neq("entity_id", id);

  if (!coEntities || coEntities.length === 0) {
    return NextResponse.json({ connections: [] });
  }

  // Group by entity, count shared cases
  const connectionMap = new Map<string, {
    entity: { id: string; canonical_name: string; type: string; phone?: string; email?: string };
    shared_cases: Array<{ id: string; case_number: number; title: string; status: string }>;
  }>();

  for (const ce of coEntities) {
    const ent = ce.entities as unknown as { id: string; canonical_name: string; type: string; phone?: string; email?: string } | null;
    if (!ent) continue;

    let conn = connectionMap.get(ent.id);
    if (!conn) {
      conn = { entity: ent, shared_cases: [] };
      connectionMap.set(ent.id, conn);
    }

    const caseInfo = entityCases.find(ec => ec.case_id === ce.case_id);
    const caseData = caseInfo?.cases as unknown as { id: string; case_number: number; title: string; status: string } | null;
    if (caseData && !conn.shared_cases.some(c => c.id === caseData.id)) {
      conn.shared_cases.push(caseData);
    }
  }

  // Sort by shared case count descending
  const connections = Array.from(connectionMap.values())
    .map(c => ({
      entity_id: c.entity.id,
      canonical_name: c.entity.canonical_name,
      type: c.entity.type,
      phone: c.entity.phone,
      email: c.entity.email,
      shared_case_count: c.shared_cases.length,
      shared_cases: c.shared_cases,
    }))
    .sort((a, b) => b.shared_case_count - a.shared_case_count);

  return NextResponse.json({ connections });
}
