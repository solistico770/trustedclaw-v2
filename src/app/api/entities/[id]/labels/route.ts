import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/require-admin";
import { createServiceClient } from "@/lib/supabase-server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const { id } = await params;
  const { label_id, applied_by } = await req.json();
  if (!label_id) return NextResponse.json({ error: "label_id required" }, { status: 400 });
  const db = createServiceClient();

  const { data: entity } = await db.from("entities").select("is_protected").eq("id", id).single();
  if (entity?.is_protected && applied_by === "agent") {
    return NextResponse.json({ error: "Entity is protected — only manual labeling" }, { status: 403 });
  }

  const { error } = await db.from("entity_labels").upsert(
    { entity_id: id, label_id, applied_by: applied_by || "user" },
    { onConflict: "entity_id,label_id" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const { id } = await params;
  const { label_id } = await req.json();
  const db = createServiceClient();
  await db.from("entity_labels").delete().eq("entity_id", id).eq("label_id", label_id);
  return NextResponse.json({ success: true });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const { id } = await params;
  const db = createServiceClient();
  const { data } = await db.from("entity_labels").select("*, labels(*)").eq("entity_id", id);
  return NextResponse.json(data || []);
}
