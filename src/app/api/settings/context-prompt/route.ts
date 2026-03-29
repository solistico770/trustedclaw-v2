import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/require-admin";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const userId = auth.user.id;

  const db = createServiceClient();
  const { data } = await db.from("user_settings").select("context_prompt").eq("user_id", userId).single();
  return NextResponse.json({ context_prompt: data?.context_prompt || "" });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const userId = auth.user.id;

  const { context_prompt } = await req.json();
  const db = createServiceClient();
  await db.from("user_settings").upsert({ user_id: userId, context_prompt }, { onConflict: "user_id" });
  return NextResponse.json({ success: true });
}
