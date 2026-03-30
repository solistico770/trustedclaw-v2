import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/require-admin";
import { createServiceClient } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;

  const { command, params } = await req.json();
  if (!command) return NextResponse.json({ error: "command required" }, { status: 400 });

  const db = createServiceClient();
  const { data, error } = await db.from("listener_commands").insert({
    user_id: auth.user.id,
    command,
    params: params || {},
    status: "pending",
  }).select("id").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ command_id: data.id });
}
