import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/require-admin";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;

  const db = createServiceClient();
  const { data } = await db.from("user_settings").select("context_prompt, identity").eq("user_id", auth.user.id).single();
  return NextResponse.json({
    context_prompt: data?.context_prompt || "",
    identity: data?.identity || {},
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;

  const body = await req.json();
  const updates: Record<string, unknown> = { user_id: auth.user.id };
  if ("context_prompt" in body) updates.context_prompt = body.context_prompt;
  if ("identity" in body) updates.identity = body.identity;

  const db = createServiceClient();
  await db.from("user_settings").upsert(updates, { onConflict: "user_id" });
  return NextResponse.json({ success: true });
}
