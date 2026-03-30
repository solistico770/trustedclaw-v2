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

    // Save signal (pending, no case) — same as new ingest behavior
    const now = new Date().toISOString();
    const { data: signal, error: signalErr } = await db.from("signals").insert({
      user_id: userId, gate_id: gateId, case_id: null,
      status: "pending",
      raw_payload: { gate_type: gType, sender_name: sender_name || "Simulator", channel_name: channel_name || "Simulator", content: message_content },
      sender_identifier: sender_name || "Simulator",
      channel_identifier: channel_name || "Simulator",
      occurred_at: now, received_at: now,
    }).select("id").single();

    if (signalErr || !signal) return NextResponse.json({ error: "Failed to save signal" }, { status: 503 });

    await logAudit(db, {
      user_id: userId, actor: "user", action_type: "signal_simulated",
      target_type: "signal", target_id: signal.id,
      reasoning: `Simulated via ${gType}`,
    });

    return NextResponse.json({ signal_id: signal.id });
  } catch (e) {
    console.error("[simulate]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
