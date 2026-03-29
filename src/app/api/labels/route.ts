import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/require-admin";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const userId = auth.user.id;

  const db = createServiceClient();
  const { data } = await db.from("labels").select("*").eq("user_id", userId).order("name");
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const userId = auth.user.id;

  const { name, color, description } = await req.json();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const db = createServiceClient();
  const { data, error } = await db.from("labels").insert({ user_id: userId, name, color: color || "#6366f1", description }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
