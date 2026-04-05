import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { handleTelegramUpdate, type TgUpdate } from "@/lib/telegram-bot";

export async function POST(req: NextRequest) {
  try {
    const update: TgUpdate = await req.json();

    // Extract bot-identifying info from the update
    // We need to find which gate this belongs to by matching the chat
    const chatId = update.message?.chat.id || update.callback_query?.message?.chat.id;
    const fromId = update.message?.from?.id || update.callback_query?.from?.id;

    if (!chatId || !fromId) {
      return NextResponse.json({ ok: true }); // Ignore malformed updates
    }

    const db = createServiceClient();

    // Find all active telegram gates with bot tokens
    const { data: gates } = await db.from("gates")
      .select("id, user_id, credentials_encrypted, metadata")
      .eq("type", "telegram")
      .eq("status", "active")
      .not("credentials_encrypted", "is", null);

    if (!gates?.length) {
      console.warn("[telegram-webhook] No active telegram gates found");
      return NextResponse.json({ ok: true });
    }

    // For now, support single-user mode — use the first gate with a valid token.
    // Multi-user would require per-bot-token webhook URLs or token matching.
    const gate = gates[0];

    if (!gate.credentials_encrypted) {
      return NextResponse.json({ ok: true });
    }

    // Update heartbeat
    await db.from("gates").update({
      metadata: { ...(gate.metadata as Record<string, unknown> || {}), last_heartbeat: new Date().toISOString() },
    }).eq("id", gate.id);

    await handleTelegramUpdate(update, gate.credentials_encrypted, gate.user_id, gate.id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[telegram-webhook]", err);
    // Always return 200 to Telegram so it doesn't retry endlessly
    return NextResponse.json({ ok: true });
  }
}
