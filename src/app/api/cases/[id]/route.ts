import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createServiceClient();

  const [c, msgs, ents, events, history] = await Promise.all([
    db.from("cases").select("*").eq("id", id).single(),
    db.from("messages").select("*").eq("case_id", id).order("occurred_at"),
    db.from("case_entities").select("*, entities(*)").eq("case_id", id),
    db.from("case_events").select("*").eq("case_id", id).order("created_at", { ascending: false }).limit(20),
    db.from("audit_logs").select("*").eq("target_id", id).eq("target_type", "case").order("created_at", { ascending: false }).limit(50),
  ]);

  if (c.error) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ case: c.data, messages: msgs.data || [], entities: ents.data || [], case_events: events.data || [], history: history.data || [] });
}
