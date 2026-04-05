import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { validateApiKey } from "@/lib/api-key-auth";
import { logAudit } from "@/lib/audit";
import { createHash } from "crypto";

// Handle both boolean and string values from JSONB metadata
function toBool(v: unknown, def: boolean): boolean {
  if (v === undefined || v === null) return def;
  return v === true || v === "true";
}

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

    // --- Gate tracking config: SINGLE filter point ---
    const { data: gate } = await db.from("gates")
      .select("metadata").eq("id", gateId).single();
    const gm = (gate?.metadata || {}) as Record<string, unknown>;
    const trackPrivate = toBool(gm.track_private, true);
    const trackGroups = toBool(gm.track_groups, true);
    const trackStatus = toBool(gm.track_status, false);

    // Read structured flags from metadata (set by claw-listener forwarder)
    const isGroup = !!(metadata?.is_group);
    const isStatus = !!(metadata?.is_status);
    const isPrivate = !isGroup && !isStatus;

    if (isStatus && !trackStatus) {
      return NextResponse.json({ skipped: true, reason: "status tracking disabled" });
    }
    if (isGroup && !trackGroups) {
      return NextResponse.json({ skipped: true, reason: "group tracking disabled" });
    }
    if (isPrivate && !trackPrivate) {
      return NextResponse.json({ skipped: true, reason: "private tracking disabled" });
    }

    // Dedup hash
    const now = new Date().toISOString();
    const signalTime = occurred_at || now;
    // Use stable identifiers for dedup (not display names which can vary between live/backfill)
    const stableDedupSender = metadata?.sender_jid || metadata?.phone || sender_name || "";
    const dedupHash = createHash("sha256")
      .update(`${gateId}:${stableDedupSender}:${content}:${signalTime}`)
      .digest("hex");

    const { data: existingSignal } = await db.from("signals")
      .select("id").eq("dedup_hash", dedupHash).limit(1).single();

    if (existingSignal) {
      // Skip entity resolution for duplicate signals
      return NextResponse.json({ signal_id: existingSignal.id, dedup: true });
    }

    // Build rich context for signal display
    const groupName = isGroup ? (metadata?.group_name || metadata?.chat_name || body.channel_name || null) : null;
    const senderDisplayName = metadata?.sender_name || sender_name || "Unknown";

    // Deterministic sender ID: use stable JID (e.g. "972501234567@c.us") or phone, never display name
    // This ensures the same person always maps to the same identifier for entity resolution
    const stableSenderId = metadata?.sender_jid || metadata?.phone || sender_name || "Unknown";

    // Channel identifier: group name for groups, chat_name for private
    // WhatsApp multi-device uses LIDs (not real phones) for all JIDs, so chat_name
    // (contact name or formatted phone) is the only human-readable identifier
    const privateChatName = metadata?.chat_name || metadata?.chat_id || stableSenderId || "Direct";
    const channelId = isGroup ? (groupName || "Group") : privateChatName;

    // Save signal with clear context
    const { data: signal, error: signalErr } = await db.from("signals").insert({
      user_id,
      gate_id: gateId,
      case_id: null,
      status: "pending",
      dedup_hash: dedupHash,
      raw_payload: {
        gate_type: gate_type || "generic",
        sender_name: senderDisplayName,
        content,
        // Structured context fields
        is_group: isGroup,
        is_private: isPrivate,
        is_status: isStatus,
        group_name: groupName,
        // Pass through all metadata
        ...(metadata || {}),
      },
      sender_identifier: stableSenderId,
      channel_identifier: channelId,
      occurred_at: signalTime,
      received_at: now,
    }).select("id").single();

    if (signalErr || !signal) {
      if (signalErr?.code === "23505") {
        return NextResponse.json({ signal_id: null, dedup: true });
      }
      console.error("[ingest] Signal insert failed:", signalErr);
      return NextResponse.json({ error: "Failed to save signal" }, { status: 503 });
    }

    // Auto-resolve sender to known entity — or auto-create if new
    let resolvedEntityId: string | null = null;
    try {
      const senderJid = metadata?.sender_jid;
      const tgUserId = metadata?.from?.id ? String(metadata.from.id) : null;
      const senderPhone = metadata?.phone || null;
      const gateTypeVal = gate_type || "generic";

      // 1. Try to find existing entity by stable ID
      if (senderJid && (gateTypeVal === "whatsapp" || senderJid.includes("@"))) {
        const { data: entity } = await db.from("entities")
          .select("id").eq("user_id", user_id).eq("wa_jid", senderJid).limit(1).single();
        if (entity) resolvedEntityId = entity.id;
      } else if (tgUserId && gateTypeVal === "telegram") {
        const { data: entity } = await db.from("entities")
          .select("id").eq("user_id", user_id).eq("tg_user_id", tgUserId).limit(1).single();
        if (entity) resolvedEntityId = entity.id;
      }

      // 2. Auto-create entity for new senders (private AND group — skip status only)
      //    In groups, sender_jid identifies the individual person, not the group
      if (!resolvedEntityId && !isStatus && (senderJid || tgUserId)) {
        // Best name: display name > phone > JID/TG-ID
        const tgFirst = metadata?.from?.first_name || null;
        const tgLast = metadata?.from?.last_name || null;
        const tgFullName = [tgFirst, tgLast].filter(Boolean).join(" ") || null;
        const bestName = (senderDisplayName !== "Unknown" && senderDisplayName)
          || tgFullName
          || senderPhone
          || (senderJid?.replace(/@.*/, ""))  // strip @c.us / @lid suffix
          || tgUserId
          || "Unknown";

        // Extract phone from WA JID if it's phone-format (10-15 digits@c.us)
        const jidPhone = senderJid?.match(/^(\d{10,15})@c\.us$/)?.[1] || null;
        const bestPhone = senderPhone || jidPhone;

        const insertData: Record<string, unknown> = {
          user_id,
          type: "person",
          canonical_name: bestName,
          status: "active",
        };
        if (senderJid) insertData.wa_jid = senderJid;
        if (bestPhone) insertData.phone = bestPhone;
        if (tgUserId) insertData.tg_user_id = tgUserId;
        const tgHandle = metadata?.from?.username || null;
        if (tgHandle) insertData.telegram_handle = tgHandle;

        const { data: newEnt, error: entErr } = await db.from("entities")
          .insert(insertData).select("id").single();
        if (newEnt) {
          resolvedEntityId = newEnt.id;
        } else if (entErr?.code === "23505") {
          // Unique constraint — concurrent insert race; re-fetch
          const col = senderJid ? "wa_jid" : "tg_user_id";
          const val = senderJid || tgUserId;
          const { data: raced } = await db.from("entities")
            .select("id").eq("user_id", user_id).eq(col, val).limit(1).single();
          if (raced) resolvedEntityId = raced.id;
        }
      }

      // 3. Link signal ↔ entity
      if (resolvedEntityId) {
        await db.from("signal_entities").upsert(
          { signal_id: signal.id, entity_id: resolvedEntityId, resolution_method: "auto" },
          { onConflict: "signal_id,entity_id" }
        );
      }
    } catch {
      // Auto-resolve is best-effort — don't fail ingestion
    }

    await logAudit(db, {
      user_id, actor: "system", action_type: "signal_ingested",
      target_type: "signal", target_id: signal.id,
      reasoning: `${isGroup ? "Group" : "Private"}: ${channelId}`,
    });

    return NextResponse.json({ signal_id: signal.id, entity_id: resolvedEntityId });
  } catch (e) {
    console.error("[ingest]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
