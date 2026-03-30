import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/require-admin";
import { createServiceClient } from "@/lib/supabase-server";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const userId = auth.user.id;

  const body = await req.json();
  const { gate_type, sender_name, channel_name, message_content } = body;
  if (!message_content) return NextResponse.json({ error: "message_content required" }, { status: 400 });

  try {
    const db = createServiceClient();
    const gType = gate_type || "simulator";

    // Find gate
    const { data: gate } = await db.from("gates")
      .select("id, metadata").eq("user_id", userId).eq("type", gType).limit(1).single();
    const gateId = gate?.id;
    if (!gateId) return NextResponse.json({ error: "No gate of type " + gType }, { status: 400 });

    // Create case
    const now = new Date().toISOString();
    const { data: newCase, error: caseErr } = await db.from("cases").insert({
      user_id: userId, status: "open", urgency: 3, importance: 3,
      message_count: 1, first_message_at: now, last_message_at: now, next_scan_at: now,
    }).select("id").single();

    if (caseErr || !newCase) return NextResponse.json({ error: "Failed to create case" }, { status: 503 });

    // Save message
    const { data: msg, error: msgErr } = await db.from("messages").insert({
      user_id: userId, gate_id: gateId, case_id: newCase.id,
      raw_payload: { gate_type: gType, sender_name: sender_name || "Simulator", channel_name: channel_name || "Simulator", content: message_content },
      sender_identifier: sender_name || "Simulator",
      channel_identifier: channel_name || "Simulator",
      occurred_at: now, received_at: now,
    }).select("id").single();

    if (msgErr || !msg) return NextResponse.json({ error: "Failed to save message" }, { status: 503 });

    // Auto-link admin entity if admin gate
    if (gate?.metadata?.is_admin_gate) {
      const { data: settings } = await db.from("user_settings").select("admin_entity_id").eq("user_id", userId).single();
      if (settings?.admin_entity_id) {
        await db.from("case_entities").upsert(
          { case_id: newCase.id, entity_id: settings.admin_entity_id, role: "primary" },
          { onConflict: "case_id,entity_id" }
        );
      }
    }

    await logAudit(db, {
      user_id: userId, actor: "user", action_type: "message_simulated",
      target_type: "message", target_id: msg.id,
      reasoning: `Simulated via ${gType}`,
    });

    return NextResponse.json({ message_id: msg.id, case_id: newCase.id });
  } catch (e) {
    console.error("[simulate]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
