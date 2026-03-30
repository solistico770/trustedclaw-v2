import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/require-admin";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const { supabase } = auth;
  const { id } = await params;

  const [c, msgs, ents, events, history] = await Promise.all([
    supabase.from("cases").select("*").eq("id", id).single(),
    supabase.from("signals").select("*").eq("case_id", id).order("occurred_at"),
    supabase.from("case_entities").select("*, entities(*)").eq("case_id", id),
    supabase.from("case_events").select("*").eq("case_id", id).order("created_at", { ascending: false }).limit(20),
    supabase.from("audit_logs").select("*").eq("target_id", id).eq("target_type", "case").order("created_at", { ascending: false }).limit(50),
  ]);

  if (c.error) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ case: c.data, messages: msgs.data || [], entities: ents.data || [], case_events: events.data || [], history: history.data || [] });
}
