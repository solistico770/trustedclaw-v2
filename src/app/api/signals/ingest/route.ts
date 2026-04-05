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
    // For backfill messages, sender_name may be a raw LID — use chat_name for private chats as fallback
    const rawSenderName = metadata?.sender_name || sender_name || "Unknown";
    const senderIsLid = rawSenderName.includes("@lid") || rawSenderName.includes("@c.us");
    const senderDisplayName = senderIsLid && !isGroup
      ? (metadata?.chat_name || rawSenderName)
      : rawSenderName;

    // The CONTACT is the other person in the conversation — for entity resolution and grouping
    // Incoming/group: contact = sender. Outgoing private: contact = recipient (chat_id).
    // contact_jid is set by the forwarder — fall back to sender_jid for backward compat
    const contactJid = metadata?.contact_jid || metadata?.sender_jid || "";
    const stableSenderId = contactJid || metadata?.phone || sender_name || "Unknown";

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

    // Auto-resolve CONTACT to known entity — or auto-create if new
    // CONTACT = the other person in the conversation (not necessarily the msg sender)
    // For outgoing private msgs, contact = recipient. For incoming/group, contact = sender.
    let resolvedEntityId: string | null = null;
    try {
      // Use contact_jid (the OTHER person) for entity resolution, not sender_jid (which is the user for outgoing)
      const resolveJid = metadata?.contact_jid || metadata?.sender_jid;
      const tgUserId = metadata?.from?.id ? String(metadata.from.id) : null;
      const isLid = !!(metadata?.is_lid) || (resolveJid?.endsWith("@lid") ?? false);
      const contactPhone = metadata?.contact_phone || (!isLid && metadata?.phone ? metadata.phone : null);
      const gateTypeVal = gate_type || "generic";

      // 1. Try to find existing entity by stable ID
      if (resolveJid && (gateTypeVal === "whatsapp" || resolveJid.includes("@"))) {
        const { data: entity } = await db.from("entities")
          .select("id, canonical_name, phone, wa_jid").eq("user_id", user_id).eq("wa_jid", resolveJid).limit(1).single();
        if (entity) {
          resolvedEntityId = entity.id;
          // Enrich entity if we now have better data (e.g. real name replacing LID)
          const updates: Record<string, string> = {};
          if (senderDisplayName !== "Unknown" && entity.canonical_name.includes("@")) updates.canonical_name = senderDisplayName;
          const jidPhone = resolveJid.match(/^(\d{10,15})@c\.us$/)?.[1] || null;
          const bestPhone = contactPhone || jidPhone;
          if (bestPhone && !entity.phone) updates.phone = bestPhone;
          if (Object.keys(updates).length) {
            await db.from("entities").update(updates).eq("id", entity.id);
          }
        }
        // Fallback: @c.us JID with phone? Check if a @lid entity exists for the same phone → upgrade it
        if (!entity && resolveJid.endsWith("@c.us")) {
          const phone = resolveJid.match(/^(\d{10,15})@c\.us$/)?.[1];
          if (phone) {
            const { data: lidEnt } = await db.from("entities")
              .select("id, canonical_name, wa_jid").eq("user_id", user_id).eq("phone", phone).limit(1).single();
            if (lidEnt && lidEnt.wa_jid?.endsWith("@lid")) {
              // Upgrade LID entity to real @c.us JID
              const upgrades: Record<string, string> = { wa_jid: resolveJid };
              if (senderDisplayName !== "Unknown" && lidEnt.canonical_name.includes("@")) upgrades.canonical_name = senderDisplayName;
              await db.from("entities").update(upgrades).eq("id", lidEnt.id);
              resolvedEntityId = lidEnt.id;
            }
          }
        }
      } else if (tgUserId && gateTypeVal === "telegram") {
        const { data: entity } = await db.from("entities")
          .select("id, canonical_name").eq("user_id", user_id).eq("tg_user_id", tgUserId).limit(1).single();
        if (entity) {
          resolvedEntityId = entity.id;
          // Enrich TG entity name if we have a better one
          const tgFirst = metadata?.from?.first_name || null;
          const tgLast = metadata?.from?.last_name || null;
          const tgName = [tgFirst, tgLast].filter(Boolean).join(" ");
          if (tgName && /^\d+$/.test(entity.canonical_name)) {
            await db.from("entities").update({ canonical_name: tgName }).eq("id", entity.id);
          }
          const tgHandle = metadata?.from?.username || null;
          if (tgHandle) {
            await db.from("entities").update({ telegram_handle: tgHandle }).eq("id", entity.id);
          }
        }
      }

      // 2. Auto-create entity for the CONTACT (the other person, not the user)
      //    In groups, sender_jid identifies the individual person, not the group
      if (!resolvedEntityId && !isStatus && (resolveJid || tgUserId)) {
        // Best name: display name > chat_name > phone > JID/TG-ID
        const tgFirst = metadata?.from?.first_name || null;
        const tgLast = metadata?.from?.last_name || null;
        const tgFullName = [tgFirst, tgLast].filter(Boolean).join(" ") || null;
        // For outgoing, use chat_name (recipient's name) since senderDisplayName is "ME → X"
        const isOutgoingMsg = metadata?.direction === "outgoing";
        const contactName = isOutgoingMsg ? (metadata?.chat_name || null) : null;
        const bestName = contactName
          || (senderDisplayName !== "Unknown" && !senderDisplayName.startsWith("ME →") && senderDisplayName)
          || tgFullName
          || contactPhone
          || (resolveJid?.replace(/@.*/, ""))  // strip @c.us / @lid suffix
          || tgUserId
          || "Unknown";

        // Extract phone from resolve JID if it's phone-format (10-15 digits@c.us)
        const jidPhone = resolveJid?.match(/^(\d{10,15})@c\.us$/)?.[1] || null;
        const bestPhone = contactPhone || jidPhone;

        const insertData: Record<string, unknown> = {
          user_id,
          type: "person",
          canonical_name: bestName,
          status: "active",
        };
        if (resolveJid) insertData.wa_jid = resolveJid;
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
          const col = resolveJid ? "wa_jid" : "tg_user_id";
          const val = resolveJid || tgUserId;
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
