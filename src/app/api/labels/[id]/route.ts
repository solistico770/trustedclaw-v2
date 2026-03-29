import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const db = createServiceClient();
  const { data } = await db.from("labels").update(body).eq("id", id).select().single();
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createServiceClient();
  await db.from("labels").delete().eq("id", id);
  return NextResponse.json({ success: true });
}
