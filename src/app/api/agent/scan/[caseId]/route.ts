import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/require-admin";
import { createServiceClient } from "@/lib/supabase-server";
import { scanCase } from "@/lib/agent-scanner";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;

  const { caseId } = await params;
  const db = createServiceClient();

  const { data: c } = await db.from("cases").select("user_id").eq("id", caseId).single();
  if (!c) return NextResponse.json({ error: "Case not found" }, { status: 404 });

  try {
    const result = await scanCase(db, caseId, c.user_id, "manual");
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
