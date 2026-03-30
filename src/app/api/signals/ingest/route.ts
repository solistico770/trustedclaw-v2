import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { validateApiKey } from "@/lib/api-key-auth";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { gate_id, gate_type, sender_name, channel_name, channel_id, content } = body;
    let { user_id } = body;

    if (!content) {
      return NextResponse.json({ error: "content required" }, { status: 400 });
    }

    // API key auth: override user_id from key owner (don't trust caller)
    const apiKey = await validateApiKey(req);
    if (apiKey) {
      user_id = apiKey.user_id;
    }

    if (!user_id) {
      return NextResponse.json({ error: "Unauthorized — provide API key or user_id" }, { status: 401 });
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

    // Save signal — NO case creation. Status = pending.
    const now = new Date().toISOString();
    const { data: signal, error: signalErr } = await db.from("signals").insert({
      user_id,
      gate_id: gateId,
      case_id: null,
      channel_id: chId,
      status: "pending",
      raw_payload: { gate_type: gate_type || "generic", sender_name, channel_name, content },
      sender_identifier: sender_name || "Unknown",
      channel_identifier: channel_name || "Default",
      occurred_at: now,
      received_at: now,
    }).select("id").single();

    if (signalErr || !signal) {
      return NextResponse.json({ error: "Failed to save signal" }, { status: 503 });
    }

    await logAudit(db, {
      user_id, actor: "system", action_type: "signal_ingested",
      target_type: "signal", target_id: signal.id,
      reasoning: `From ${gate_type || "generic"}/${channel_name || "default"}`,
    });

    return NextResponse.json({ signal_id: signal.id });
  } catch (e) {
    console.error("[ingest]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
