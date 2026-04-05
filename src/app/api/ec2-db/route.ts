import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/require-admin";
import { createServiceClient } from "@/lib/supabase-server";

const VALID_ACTIONS = ["query", "get_row", "stats"] as const;
type Action = (typeof VALID_ACTIONS)[number];

const ACTION_TO_COMMAND: Record<Action, string> = {
  query: "db_query",
  get_row: "db_get_row",
  stats: "db_stats",
};

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;

  const { action, params } = await req.json();
  if (!action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json({ error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}` }, { status: 400 });
  }

  const db = createServiceClient();
  const command = ACTION_TO_COMMAND[action as Action];

  const { data, error } = await db
    .from("listener_commands")
    .insert({
      user_id: auth.user.id,
      command,
      params: params || {},
      status: "pending",
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, command_id: data.id });
}
