import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthResultError } from "@/lib/require-auth";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, "gates");
  if (isAuthResultError(auth)) return auth.error;

  const db = createServiceClient();
  const { data, error } = await db.from("gates").select("*").eq("user_id", auth.user_id).order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, "gates");
  if (isAuthResultError(auth)) return auth.error;

  const body = await req.json();
  const { type, display_name, description, metadata } = body;
  if (!type || !display_name) return NextResponse.json({ error: "type, display_name required" }, { status: 400 });
  const db = createServiceClient();
  const { data, error } = await db.from("gates").insert({
    user_id: auth.user_id, type, display_name, status: "active",
    metadata: { description: description || "", ...metadata },
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
