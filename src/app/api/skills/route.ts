import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/require-admin";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const userId = auth.user.id;

  const db = createServiceClient();
  const { data, error } = await db.from("skills").select("*").eq("user_id", userId).order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const userId = auth.user.id;

  const body = await req.json();
  const { name, summary, instructions, auto_attach } = body;
  if (!name || !summary || !instructions) {
    return NextResponse.json({ error: "name, summary, instructions required" }, { status: 400 });
  }
  const db = createServiceClient();
  const { data, error } = await db.from("skills").insert({
    user_id: userId, name, summary, instructions, auto_attach: auto_attach || false,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
