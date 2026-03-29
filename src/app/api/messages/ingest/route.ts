import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { gate_id, gate_type, sender_name, channel_name, channel_id, content, user_id } = body;

    if (!content || !user_id) {
      return NextResponse.json({ error: "content and user_id required" }, { status: 400 });
    }

    const db = createServiceClient();

    // Find or create gate
    let gateId = gate_id;
    if (!gateId) {
      const gType = gate_type || "generic";
      const { data: existing } = await db.from("gates")
        .select("id").eq("user_id", user_id).eq("type", gType).limit(1).single();
      if (existing) {
        gateId = existing.id;
      } else {
        const { data: newGate } = await db.from("gates").insert({
          user_id, type: gType, display_name: gType.charAt(0).toUpperCase() + gType.slice(1),
        }).select("id").single();
        gateId = newGate?.id;
      }
    }

    // Resolve channel_id
    let chId = channel_id || null;
    if (!chId && channel_name) {
      const { data: ch } = await db.from("channels")
        .select("id").eq("user_id", user_id).eq("name", channel_name).eq("is_active", true).limit(1).single();
      chId = ch?.id || null;
    }

    // Create case (pending — no AI)
    const now = new Date().toISOString();
    const { data: newCase, error: caseErr } = await db.from("cases").insert({
      user_id,
      status: "open",
      urgency: 3,
      importance: 3,
      message_count: 1,
      first_message_at: now,
      last_message_at: now,
      next_scan_at: now,
    }).select("id").single();

    if (caseErr || !newCase) {
      return NextResponse.json({ error: "Failed to create case" }, { status: 503 });
    }

    // Save message
    const { data: msg, error: msgErr } = await db.from("messages").insert({
      user_id,
      gate_id: gateId,
      case_id: newCase.id,
      channel_id: chId,
      raw_payload: { gate_type: gate_type || "generic", sender_name, channel_name, content },
      sender_identifier: sender_name || "Unknown",
      channel_identifier: channel_name || "Default",
      occurred_at: now,
      received_at: now,
    }).select("id").single();

    if (msgErr || !msg) {
      return NextResponse.json({ error: "Failed to save message" }, { status: 503 });
    }

    await logAudit(db, {
      user_id, actor: "system", action_type: "message_ingested",
      target_type: "message", target_id: msg.id,
      reasoning: `From ${gate_type || "generic"}/${channel_name || "default"}`,
    });

    return NextResponse.json({ message_id: msg.id, case_id: newCase.id });
  } catch (e) {
    console.error("[ingest]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
