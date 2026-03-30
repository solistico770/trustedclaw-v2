import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/require-admin";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;

  const commandId = req.nextUrl.searchParams.get("command_id");
  if (!commandId) return NextResponse.json({ error: "command_id required" }, { status: 400 });

  const db = createServiceClient();
  const { data } = await db
    .from("listener_responses")
    .select("id, data, created_at")
    .eq("command_id", commandId)
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!data) return NextResponse.json({ data: null });
  return NextResponse.json(data);
}
