import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

// Add label to entity
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { label_id, applied_by } = await req.json();
  if (!label_id) return NextResponse.json({ error: "label_id required" }, { status: 400 });
  const db = createServiceClient();

  // Check if entity is protected — only user can add labels
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

// Remove label from entity
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { label_id } = await req.json();
  const db = createServiceClient();
  await db.from("entity_labels").delete().eq("entity_id", id).eq("label_id", label_id);
  return NextResponse.json({ success: true });
}

// Get labels for entity
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createServiceClient();
  const { data } = await db.from("entity_labels").select("*, labels(*)").eq("entity_id", id);
  return NextResponse.json(data || []);
}
