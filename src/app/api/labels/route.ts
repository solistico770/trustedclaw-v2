import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id");
  if (!userId) return NextResponse.json({ error: "user_id required" }, { status: 400 });
  const db = createServiceClient();
  const { data } = await db.from("labels").select("*").eq("user_id", userId).order("name");
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const { user_id, name, color, description } = await req.json();
  if (!user_id || !name) return NextResponse.json({ error: "user_id, name required" }, { status: 400 });
  const db = createServiceClient();
  const { data, error } = await db.from("labels").insert({ user_id, name, color: color || "#6366f1", description }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
