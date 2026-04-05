import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/require-admin";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const { user, supabase } = auth;
  const { id } = await params;

  const { data: ched } = await supabase.from("cheds").select("is_active, trigger_type, interval_seconds").eq("id", id).eq("user_id", user.id).single();
  if (!ched) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const newActive = !ched.is_active;
  const update: Record<string, unknown> = { is_active: newActive, updated_at: new Date().toISOString() };

  // Recalculate next_run_at when reactivating interval cheds
  if (newActive && ched.trigger_type === "interval" && ched.interval_seconds) {
    update.next_run_at = new Date(Date.now() + ched.interval_seconds * 1000).toISOString();
  }

  const { data, error } = await supabase.from("cheds").update(update).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
