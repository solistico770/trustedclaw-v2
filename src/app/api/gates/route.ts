import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id");
  if (!userId) return NextResponse.json({ error: "user_id required" }, { status: 400 });
  const db = createServiceClient();
  const { data, error } = await db.from("gates").select("*").eq("user_id", userId).order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { user_id, type, display_name, description, metadata } = body;
  if (!user_id || !type || !display_name) return NextResponse.json({ error: "user_id, type, display_name required" }, { status: 400 });
  const db = createServiceClient();
  const { data, error } = await db.from("gates").insert({
    user_id, type, display_name, status: "active",
    metadata: { description: description || "", ...metadata },
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
