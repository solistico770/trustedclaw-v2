import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id");
  if (!userId) return NextResponse.json({ error: "user_id required" }, { status: 400 });
  const db = createServiceClient();
  const { data, error } = await db.from("skills").select("*").eq("user_id", userId).order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { user_id, name, summary, instructions, auto_attach } = body;
  if (!user_id || !name || !summary || !instructions) {
    return NextResponse.json({ error: "user_id, name, summary, instructions required" }, { status: 400 });
  }
  const db = createServiceClient();
  const { data, error } = await db.from("skills").insert({
    user_id, name, summary, instructions, auto_attach: auto_attach || false,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
