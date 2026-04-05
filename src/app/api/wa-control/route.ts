import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/require-admin";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;

  const db = createServiceClient();

  // Fetch all WA gates
  const { data: gates } = await db
    .from("gates")
    .select("*")
    .eq("user_id", auth.user.id)
    .eq("type", "whatsapp")
    .order("created_at", { ascending: false });

  // Fetch recent listener commands (last 50)
  const { data: commands } = await db
    .from("listener_commands")
    .select("id, command, params, status, created_at")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  // Fetch recent listener responses (last 50)
  const { data: responses } = await db
    .from("listener_responses")
    .select("id, command_id, data, created_at")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  // Fetch recent WA signals (last 100)
  const gateIds = (gates || []).map((g: { id: string }) => g.id);
  let signals: unknown[] = [];
  if (gateIds.length > 0) {
    const { data } = await db
      .from("signals")
      .select("id, gate_id, sender_identifier, channel_identifier, raw_payload, status, created_at")
      .in("gate_id", gateIds)
      .order("created_at", { ascending: false })
      .limit(100);
    signals = data || [];
  }

  return NextResponse.json({ gates: gates || [], commands: commands || [], responses: responses || [], signals });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;

  const { action, gate_id, params } = await req.json();
  if (!action) return NextResponse.json({ error: "action required" }, { status: 400 });

  const db = createServiceClient();

  switch (action) {
    case "clear_commands": {
      await db.from("listener_commands").delete().eq("user_id", auth.user.id);
      await db.from("listener_responses").delete().eq("user_id", auth.user.id);
      return NextResponse.json({ ok: true, message: "Commands & responses cleared" });
    }

    case "push_dummy": {
      if (!gate_id) return NextResponse.json({ error: "gate_id required" }, { status: 400 });
      const now = new Date().toISOString();
      const { error } = await db.from("signals").insert({
        gate_id,
        user_id: auth.user.id,
        sender_identifier: "dummy-test-sender",
        channel_identifier: "dummy-test-channel",
        raw_payload: {
          sender_name: "Test Dummy",
          content: `[DUMMY] Test message at ${now}`,
          sender_jid: "0000000000@c.us",
          chat_name: "Dummy Test Chat",
          is_group: false,
          is_status: false,
        },
        status: "pending",
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, message: "Dummy signal pushed" });
    }

    case "reset_gate_status": {
      if (!gate_id) return NextResponse.json({ error: "gate_id required" }, { status: 400 });
      const { data: gate } = await db.from("gates").select("metadata").eq("id", gate_id).single();
      const meta = (gate?.metadata || {}) as Record<string, unknown>;
      meta.wa_status = "disconnected";
      delete meta.last_heartbeat;
      delete meta.wa_phone;
      await db.from("gates").update({ metadata: meta, status: "inactive" }).eq("id", gate_id);
      return NextResponse.json({ ok: true, message: "Gate status reset" });
    }

    case "clear_signals": {
      if (!gate_id) return NextResponse.json({ error: "gate_id required" }, { status: 400 });
      const { count } = await db.from("signals").delete({ count: "exact" }).eq("gate_id", gate_id);
      return NextResponse.json({ ok: true, message: `Cleared ${count || 0} signals` });
    }

    case "send_command": {
      const command = params?.command;
      if (!command) return NextResponse.json({ error: "params.command required" }, { status: 400 });
      const { data, error } = await db.from("listener_commands").insert({
        user_id: auth.user.id,
        command,
        params: params?.command_params || {},
        status: "pending",
      }).select("id").single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, command_id: data.id });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
