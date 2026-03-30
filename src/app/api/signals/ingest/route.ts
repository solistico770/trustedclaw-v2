import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { validateApiKey } from "@/lib/api-key-auth";
import { logAudit } from "@/lib/audit";
import { createHash } from "crypto";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { gate_id, gate_type, sender_name, content, occurred_at, metadata } = body;
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

    // Dedup hash: same gate + sender + content + timestamp = same signal
    const now = new Date().toISOString();
    const signalTime = occurred_at || now;
    const dedupHash = createHash("sha256")
      .update(`${gateId}:${sender_name || ""}:${content}:${signalTime}`)
      .digest("hex");

    // Check if signal already exists (dedup)
    const { data: existingSignal } = await db.from("signals")
      .select("id").eq("dedup_hash", dedupHash).limit(1).single();

    if (existingSignal) {
      return NextResponse.json({ signal_id: existingSignal.id, dedup: true });
    }

    // Save signal — pending for triage
    const { data: signal, error: signalErr } = await db.from("signals").insert({
      user_id,
      gate_id: gateId,
      case_id: null,
      status: "pending",
      dedup_hash: dedupHash,
      raw_payload: { gate_type: gate_type || "generic", sender_name, content, ...(metadata || {}) },
      sender_identifier: sender_name || "Unknown",
      channel_identifier: body.channel_name || "Default",
      occurred_at: signalTime,
      received_at: now,
    }).select("id").single();

    if (signalErr || !signal) {
      // Could be unique constraint violation (race condition dedup)
      if (signalErr?.code === "23505") {
        return NextResponse.json({ signal_id: null, dedup: true });
      }
      console.error("[ingest] Signal insert failed:", signalErr);
      return NextResponse.json({ error: "Failed to save signal" }, { status: 503 });
    }

    await logAudit(db, {
      user_id, actor: "system", action_type: "signal_ingested",
      target_type: "signal", target_id: signal.id,
      reasoning: `From gate ${gate_type || "generic"}`,
    });

    return NextResponse.json({ signal_id: signal.id });
  } catch (e) {
    console.error("[ingest]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
