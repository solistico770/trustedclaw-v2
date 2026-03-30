import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/require-admin";
import { createServiceClient } from "@/lib/supabase-server";

const DEFAULT_TYPES = [
  { slug: "person", display_name: "Person", icon: "user", is_default: true },
  { slug: "company", display_name: "Company", icon: "building", is_default: true },
  { slug: "project", display_name: "Project", icon: "folder", is_default: true },
  { slug: "invoice", display_name: "Invoice", icon: "receipt", is_default: true },
  { slug: "bank_account", display_name: "Bank Account", icon: "bank", is_default: true },
  { slug: "contract", display_name: "Contract", icon: "file-text", is_default: true },
  { slug: "product", display_name: "Product", icon: "package", is_default: true },
  { slug: "bot", display_name: "Bot", icon: "bot", is_default: true },
  { slug: "task", display_name: "Task", icon: "check-square", is_default: true },
  { slug: "other", display_name: "Other", icon: "circle", is_default: true },
];

export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;

  const db = createServiceClient();
  const { data, error } = await db.from("entity_types")
    .select("*").eq("user_id", auth.user.id).order("is_default", { ascending: false }).order("display_name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Seed defaults if empty
  if (!data || data.length === 0) {
    const seeds = DEFAULT_TYPES.map(t => ({ ...t, user_id: auth.user.id }));
    const { data: seeded } = await db.from("entity_types").insert(seeds).select();
    return NextResponse.json(seeded || []);
  }

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;

  const { slug, display_name, icon, color, context } = await req.json();
  if (!slug?.trim() || !display_name?.trim()) {
    return NextResponse.json({ error: "slug and display_name required" }, { status: 400 });
  }

  const db = createServiceClient();
  const { data, error } = await db.from("entity_types").insert({
    user_id: auth.user.id,
    slug: slug.trim().toLowerCase().replace(/\s+/g, "_"),
    display_name: display_name.trim(),
    icon: icon || null,
    color: color || null,
    context: context || null,
    is_default: false,
  }).select().single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Entity type already exists" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = createServiceClient();

  // Check if any entities use this type
  const { data: typeRecord } = await db.from("entity_types").select("slug").eq("id", id).eq("user_id", auth.user.id).single();
  if (!typeRecord) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { count } = await db.from("entities").select("*", { count: "exact", head: true }).eq("user_id", auth.user.id).eq("type", typeRecord.slug);
  if (count && count > 0) {
    return NextResponse.json({ error: `Cannot delete: ${count} entities use this type` }, { status: 409 });
  }

  await db.from("entity_types").delete().eq("id", id).eq("user_id", auth.user.id);
  return NextResponse.json({ success: true });
}
