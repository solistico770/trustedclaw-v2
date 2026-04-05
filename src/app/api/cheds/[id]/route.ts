import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/require-admin";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const { user, supabase } = auth;
  const { id } = await params;

  const { data: ched, error } = await supabase.from("cheds").select("*").eq("id", id).eq("user_id", user.id).single();
  if (error || !ched) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: runs } = await supabase.from("ched_runs").select("*").eq("ched_id", id).order("ran_at", { ascending: false }).limit(10);

  return NextResponse.json({ ...ched, runs: runs || [] });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const { user, supabase } = auth;
  const { id } = await params;

  const body = await req.json();
  const { title, context, trigger_type, interval_seconds } = body;

  if (trigger_type && !["interval", "after_llm_change"].includes(trigger_type)) {
    return NextResponse.json({ error: "trigger_type must be 'interval' or 'after_llm_change'" }, { status: 400 });
  }
  if (trigger_type === "interval" && interval_seconds !== undefined && interval_seconds <= 0) {
    return NextResponse.json({ error: "interval_seconds must be > 0 for interval type" }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (title !== undefined) update.title = title;
  if (context !== undefined) update.context = context;
  if (trigger_type !== undefined) {
    update.trigger_type = trigger_type;
    if (trigger_type === "after_llm_change") {
      update.next_run_at = null;
      update.interval_seconds = null;
    }
  }
  if (interval_seconds !== undefined) {
    update.interval_seconds = interval_seconds;
    if (trigger_type === "interval" || (!trigger_type && interval_seconds > 0)) {
      update.next_run_at = new Date(Date.now() + interval_seconds * 1000).toISOString();
    }
  }

  const { data, error } = await supabase.from("cheds").update(update).eq("id", id).eq("user_id", user.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const { user, supabase } = auth;
  const { id } = await params;

  const { error } = await supabase.from("cheds").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
