import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id");
  if (!userId) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  const db = createServiceClient();
  const { data } = await db.from("user_settings").select("context_prompt").eq("user_id", userId).single();
  return NextResponse.json({ context_prompt: data?.context_prompt || "" });
}

export async function POST(req: NextRequest) {
  const { user_id, context_prompt } = await req.json();
  if (!user_id) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  const db = createServiceClient();
  await db.from("user_settings").upsert({ user_id, context_prompt }, { onConflict: "user_id" });
  return NextResponse.json({ success: true });
}
