import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/require-admin";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const db = auth.supabase;
  const userId = auth.user.id;

  const url = req.nextUrl;
  const status = url.searchParams.get("status");
  const caseId = url.searchParams.get("case_id");
  const due = url.searchParams.get("due");
  const scheduled = url.searchParams.get("scheduled");
  const search = url.searchParams.get("search");

  let query = db.from("tasks")
    .select("*, cases(case_number, title)")
    .eq("user_id", userId)
    .order("due_at", { ascending: true, nullsFirst: false });

  if (status) query = query.eq("status", status);
  if (caseId) query = query.eq("case_id", caseId);
  if (search) query = query.or(`title.ilike.%${search}%`);

  const now = new Date().toISOString();
  if (due === "overdue") query = query.eq("status", "open").lt("due_at", now);
  else if (due === "today") {
    const start = new Date(); start.setHours(0,0,0,0);
    const end = new Date(); end.setHours(23,59,59,999);
    query = query.gte("due_at", start.toISOString()).lte("due_at", end.toISOString());
  } else if (due === "this_week") {
    const end = new Date(); end.setDate(end.getDate() + 7);
    query = query.gte("due_at", now).lte("due_at", end.toISOString());
  } else if (due === "no_date") {
    query = query.is("due_at", null);
  }

  if (scheduled === "past") query = query.lt("scheduled_at", now).not("scheduled_at", "is", null);
  else if (scheduled === "today") {
    const start = new Date(); start.setHours(0,0,0,0);
    const end = new Date(); end.setHours(23,59,59,999);
    query = query.gte("scheduled_at", start.toISOString()).lte("scheduled_at", end.toISOString());
  } else if (scheduled === "upcoming") query = query.gt("scheduled_at", now);
  else if (scheduled === "unscheduled") query = query.is("scheduled_at", null);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const db = auth.supabase;
  const userId = auth.user.id;

  const body = await req.json();
  const { case_id, title, description, scheduled_at, due_at } = body;

  if (!case_id || !title) {
    return NextResponse.json({ error: "case_id and title required" }, { status: 400 });
  }

  // Auto-create entity for this task
  const { data: entity } = await db.from("entities").insert({
    user_id: userId, type: "task", canonical_name: title, status: "active",
  }).select("id").single();

  const entityId = entity?.id || null;

  // Create task
  const { data: task, error } = await db.from("tasks").insert({
    user_id: userId, case_id, entity_id: entityId,
    title, description: description || null,
    scheduled_at: scheduled_at || null,
    due_at: due_at || null,
  }).select("*").single();

  if (error || !task) {
    return NextResponse.json({ error: "Failed to create task" }, { status: 503 });
  }

  // Link entity to case
  if (entityId) {
    await db.from("case_entities").upsert(
      { case_id, entity_id: entityId, role: "related" },
      { onConflict: "case_id,entity_id" }
    );
  }

  await logAudit(db, {
    user_id: userId, actor: "user", action_type: "task_created",
    target_type: "task", target_id: task.id,
    reasoning: `Task: ${title}`,
  });

  return NextResponse.json(task);
}
