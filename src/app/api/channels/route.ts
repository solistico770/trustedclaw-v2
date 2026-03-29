import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id");
  if (!userId) return NextResponse.json({ error: "user_id required" }, { status: 400 });
  const db = createServiceClient();
  const { data, error } = await db.from("channels").select("*, gates(type, display_name)").eq("user_id", userId).eq("is_active", true).order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { user_id, gate_id, name, description, external_id } = body;
  if (!user_id || !name) return NextResponse.json({ error: "user_id and name required" }, { status: 400 });
  const db = createServiceClient();
  const { data, error } = await db.from("channels").insert({ user_id, gate_id, name, description, external_id }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
