import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/require-admin";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const userId = auth.user.id;

  const db = createServiceClient();
  const { data, error } = await db.from("gates").select("*").eq("user_id", userId).order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const userId = auth.user.id;

  const body = await req.json();
  const { type, display_name, description, metadata } = body;
  if (!type || !display_name) return NextResponse.json({ error: "type, display_name required" }, { status: 400 });
  const db = createServiceClient();
  const { data, error } = await db.from("gates").insert({
    user_id: userId, type, display_name, status: "active",
    metadata: { description: description || "", ...metadata },
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
