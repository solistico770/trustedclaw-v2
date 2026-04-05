import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

type TimelineEvent = {
  event_type: "signal" | "case" | "task" | "case_event";
  id: string;
  timestamp: string;
  content: string;
  case_id: string | null;
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: entityId } = await params;
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 200);
  const since = url.searchParams.get("since") || null;

  const db = createServiceClient();

  // Verify entity exists
  const { data: entity, error: entErr } = await db
    .from("entities")
    .select("id, user_id")
    .eq("id", entityId)
    .single();

  if (entErr || !entity) {
    return NextResponse.json({ error: "Entity not found" }, { status: 404 });
  }

  const sinceFilter = since || "1970-01-01T00:00:00Z";
  const events: TimelineEvent[] = [];

  // Signals via signal_entities
  const { data: signalLinks } = await db
    .from("signal_entities")
    .select("signals(id, occurred_at, raw_payload, case_id)")
    .eq("entity_id", entityId);

  for (const sl of signalLinks || []) {
    const s = sl.signals as unknown as { id: string; occurred_at: string; raw_payload: Record<string, unknown>; case_id: string | null } | null;
    if (!s || s.occurred_at < sinceFilter) continue;
    events.push({
      event_type: "signal",
      id: s.id,
      timestamp: s.occurred_at,
      content: ((s.raw_payload?.content as string) || "").slice(0, 200),
      case_id: s.case_id,
    });
  }

  // Cases via case_entities
  const { data: caseLinks } = await db
    .from("case_entities")
    .select("cases(id, created_at, title, case_number, status)")
    .eq("entity_id", entityId);

  const linkedCaseIds: string[] = [];
  for (const cl of caseLinks || []) {
    const c = cl.cases as unknown as { id: string; created_at: string; title: string; case_number: number; status: string } | null;
    if (!c || c.created_at < sinceFilter) continue;
    linkedCaseIds.push(c.id);
    events.push({
      event_type: "case",
      id: c.id,
      timestamp: c.created_at,
      content: `Case #${c.case_number}: ${c.title || "untitled"} [${c.status}]`,
      case_id: c.id,
    });
  }

  // Tasks via entity_id
  const { data: tasks } = await db
    .from("tasks")
    .select("id, created_at, title, case_id, status")
    .eq("entity_id", entityId)
    .gte("created_at", sinceFilter);

  for (const t of tasks || []) {
    events.push({
      event_type: "task",
      id: t.id,
      timestamp: t.created_at,
      content: `${t.title} [${t.status}]`,
      case_id: t.case_id,
    });
  }

  // Case events (LLM scan reasoning) for linked cases
  if (linkedCaseIds.length > 0) {
    const { data: cEvents } = await db
      .from("case_events")
      .select("id, created_at, event_type, out_raw, case_id")
      .in("case_id", linkedCaseIds)
      .gte("created_at", sinceFilter)
      .order("created_at", { ascending: false })
      .limit(20);

    for (const ce of cEvents || []) {
      events.push({
        event_type: "case_event",
        id: ce.id,
        timestamp: ce.created_at,
        content: `[${ce.event_type}] ${((ce.out_raw as Record<string, unknown>)?.reasoning as string) || ""}`.slice(0, 200),
        case_id: ce.case_id,
      });
    }
  }

  // Sort and limit
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const timeline = events.slice(0, limit);

  return NextResponse.json({
    entity_id: entityId,
    timeline,
    count: timeline.length,
  });
}
