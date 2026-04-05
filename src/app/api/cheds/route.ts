import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/require-admin";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const { user, supabase } = auth;

  let query = supabase.from("cheds").select("*").eq("user_id", user.id).order("created_at", { ascending: false });

  const active = req.nextUrl.searchParams.get("active");
  if (active === "true") query = query.eq("is_active", true);
  else if (active === "false") query = query.eq("is_active", false);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const { user, supabase } = auth;

  const body = await req.json();
  const { title, context, trigger_type, interval_seconds } = body;

  if (!title || !context || !trigger_type) {
    return NextResponse.json({ error: "title, context, and trigger_type are required" }, { status: 400 });
  }
  if (!["interval", "after_llm_change"].includes(trigger_type)) {
    return NextResponse.json({ error: "trigger_type must be 'interval' or 'after_llm_change'" }, { status: 400 });
  }
  if (trigger_type === "interval" && (!interval_seconds || interval_seconds <= 0)) {
    return NextResponse.json({ error: "interval_seconds must be > 0 for interval type" }, { status: 400 });
  }

  const next_run_at = trigger_type === "interval"
    ? new Date(Date.now() + (interval_seconds || 3600) * 1000).toISOString()
    : null;

  const { data, error } = await supabase.from("cheds").insert({
    user_id: user.id,
    title,
    context,
    trigger_type,
    interval_seconds: trigger_type === "interval" ? interval_seconds : null,
    next_run_at,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
