import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthResultError } from "@/lib/require-auth";
import { createServiceClient } from "@/lib/supabase-server";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req, "gates");
  if (isAuthResultError(auth)) return auth.error;
  const { id } = await params;
  const body = await req.json();
  const db = createServiceClient();
  const { data, error } = await db.from("gates").update(body).eq("id", id).eq("user_id", auth.user_id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req, "gates");
  if (isAuthResultError(auth)) return auth.error;
  const { id } = await params;
  const db = createServiceClient();
  await db.from("gates").delete().eq("id", id).eq("user_id", auth.user_id);
  return NextResponse.json({ success: true });
}
