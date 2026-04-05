import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthResultError } from "@/lib/require-auth";
import { createServiceClient } from "@/lib/supabase-server";

const TG_API = "https://api.telegram.org/bot";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthResultError(auth)) return auth.error;

  const { bot_token } = await req.json();
  if (!bot_token || !bot_token.includes(":")) {
    return NextResponse.json({ error: "Invalid bot token" }, { status: 400 });
  }

  // Validate token with Telegram
  const meRes = await fetch(`${TG_API}${bot_token}/getMe`);
  if (!meRes.ok) {
    return NextResponse.json({ error: "Invalid bot token — Telegram rejected it" }, { status: 400 });
  }
  const me = await meRes.json();
  if (!me.ok) {
    return NextResponse.json({ error: me.description || "Telegram API error" }, { status: 400 });
  }

  const botInfo = me.result; // { id, is_bot, first_name, username }

  const db = createServiceClient();

  // Upsert telegram gate for this user
  const { data: existingGate } = await db.from("gates")
    .select("id")
    .eq("user_id", auth.user_id)
    .eq("type", "telegram")
    .eq("display_name", `Telegram @${botInfo.username}`)
    .limit(1)
    .single();

  let gateId: string;

  if (existingGate) {
    gateId = existingGate.id;
    await db.from("gates").update({
      status: "active",
      credentials_encrypted: bot_token,
      metadata: {
        bot_id: String(botInfo.id),
        bot_username: botInfo.username,
        bot_name: botInfo.first_name,
        track_private: true,
        track_groups: true,
      },
    }).eq("id", gateId);
  } else {
    // Check if any telegram gate exists for this user
    const { data: anyTgGate } = await db.from("gates")
      .select("id")
      .eq("user_id", auth.user_id)
      .eq("type", "telegram")
      .not("display_name", "like", "Telegram @%")
      .limit(1)
      .single();

    if (anyTgGate) {
      // Update existing generic telegram gate
      gateId = anyTgGate.id;
      await db.from("gates").update({
        display_name: `Telegram @${botInfo.username}`,
        status: "active",
        credentials_encrypted: bot_token,
        metadata: {
          bot_id: String(botInfo.id),
          bot_username: botInfo.username,
          bot_name: botInfo.first_name,
          track_private: true,
          track_groups: true,
        },
      }).eq("id", gateId);
    } else {
      const { data: newGate, error } = await db.from("gates").insert({
        user_id: auth.user_id,
        type: "telegram",
        display_name: `Telegram @${botInfo.username}`,
        status: "active",
        credentials_encrypted: bot_token,
        metadata: {
          bot_id: String(botInfo.id),
          bot_username: botInfo.username,
          bot_name: botInfo.first_name,
          track_private: true,
          track_groups: true,
        },
      }).select("id").single();
      if (error || !newGate) {
        return NextResponse.json({ error: "Failed to create gate" }, { status: 500 });
      }
      gateId = newGate.id;
    }
  }

  // Register webhook with Telegram
  // Use VERCEL_PROJECT_PRODUCTION_URL or NEXT_PUBLIC_APP_URL for the public HTTPS URL
  const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.NEXT_PUBLIC_APP_URL || "";
  const origin = req.headers.get("origin") || "";
  // Prefer production URL (guaranteed HTTPS), fall back to origin
  const baseUrl = productionUrl || origin;
  const webhookUrl = `${baseUrl}/api/telegram/webhook`;

  let webhookSet = false;
  let webhookError = "";

  if (baseUrl.startsWith("https://")) {
    try {
      const whRes = await fetch(`${TG_API}${bot_token}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: ["message", "callback_query"],
        }),
      });
      const whData = await whRes.json();
      webhookSet = !!whData.ok;
      if (!whData.ok) webhookError = whData.description || "Unknown error";
    } catch (e) {
      webhookError = e instanceof Error ? e.message : "Fetch failed";
    }
  } else {
    webhookError = "Webhook requires HTTPS — will auto-register on deploy";
  }

  return NextResponse.json({
    bot: botInfo,
    gate_id: gateId,
    webhook_url: webhookUrl,
    webhook_set: webhookSet,
    webhook_error: webhookError || undefined,
  });
}

// GET: check current bot status
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthResultError(auth)) return auth.error;

  const db = createServiceClient();
  const { data: gate } = await db.from("gates")
    .select("id, display_name, status, credentials_encrypted, metadata, created_at")
    .eq("user_id", auth.user_id)
    .eq("type", "telegram")
    .not("credentials_encrypted", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!gate || !gate.credentials_encrypted) {
    return NextResponse.json({ connected: false });
  }

  // Verify bot is still valid
  const meRes = await fetch(`${TG_API}${gate.credentials_encrypted}/getMe`);
  const me = meRes.ok ? await meRes.json() : null;

  const md = (gate.metadata || {}) as Record<string, unknown>;

  return NextResponse.json({
    connected: !!me?.ok,
    gate_id: gate.id,
    bot_username: md.bot_username || null,
    bot_name: md.bot_name || null,
    bot_id: md.bot_id || null,
    status: gate.status,
  });
}

// DELETE: disconnect bot
export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthResultError(auth)) return auth.error;

  const db = createServiceClient();
  const { data: gate } = await db.from("gates")
    .select("id, credentials_encrypted")
    .eq("user_id", auth.user_id)
    .eq("type", "telegram")
    .not("credentials_encrypted", "is", null)
    .limit(1)
    .single();

  if (gate?.credentials_encrypted) {
    // Remove webhook
    await fetch(`${TG_API}${gate.credentials_encrypted}/deleteWebhook`);
    // Clear credentials
    await db.from("gates").update({
      credentials_encrypted: null,
      status: "inactive",
    }).eq("id", gate.id);
  }

  return NextResponse.json({ disconnected: true });
}
