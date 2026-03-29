import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/require-admin";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const { id } = await params;

  const db = createServiceClient();
  const [entity, caseEntities, messages] = await Promise.all([
    db.from("entities").select("*").eq("id", id).single(),
    db.from("case_entities").select("role, cases(id, case_number, title, status, urgency, importance, last_message_at)")
      .eq("entity_id", id),
    db.from("case_entities").select("cases(id, case_number, title, messages(id, raw_payload, sender_identifier, occurred_at))")
      .eq("entity_id", id),
  ]);

  if (entity.error) return NextResponse.json({ error: "Entity not found" }, { status: 404 });

  const allMessages: Array<{ id: string; content: string; sender: string; occurred_at: string; case_number: number; case_title: string }> = [];
  for (const ce of messages.data || []) {
    const c = ce.cases as unknown as Record<string, unknown> | null;
    if (!c) continue;
    const msgs = (c.messages || []) as Array<Record<string, unknown>>;
    for (const m of msgs) {
      allMessages.push({
        id: m.id as string,
        content: (m.raw_payload as Record<string, string>)?.content || "",
        sender: m.sender_identifier as string || "Unknown",
        occurred_at: m.occurred_at as string,
        case_number: c.case_number as number,
        case_title: c.title as string || "",
      });
    }
  }
  allMessages.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());

  const cases = (caseEntities.data || []).map(ce => ({ ...(ce.cases as unknown as Record<string, unknown>), role: ce.role }));

  return NextResponse.json({
    entity: entity.data, cases,
    messages: allMessages.slice(0, 50),
    case_count: cases.length, message_count: allMessages.length,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const { id } = await params;
  const body = await req.json();
  const allowed = ["canonical_name", "type", "phone", "email", "whatsapp_number", "telegram_handle", "website", "external_id"];
  const updates: Record<string, unknown> = {};
  for (const k of allowed) { if (body[k] !== undefined) updates[k] = body[k]; }

  const db = createServiceClient();
  const { data, error } = await db.from("entities").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
