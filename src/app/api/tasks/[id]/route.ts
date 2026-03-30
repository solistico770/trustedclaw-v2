import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/require-admin";
import { logAudit } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const db = auth.supabase;
  const userId = auth.user.id;
  const { id } = await params;

  const { data, error } = await db.from("tasks")
    .select("*, cases(case_number, title)")
    .eq("id", id).eq("user_id", userId).single();

  if (error || !data) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const db = auth.supabase;
  const userId = auth.user.id;
  const { id } = await params;

  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.scheduled_at !== undefined) updates.scheduled_at = body.scheduled_at;
  if (body.due_at !== undefined) updates.due_at = body.due_at;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await db.from("tasks")
    .update(updates).eq("id", id).eq("user_id", userId)
    .select("*").single();

  if (error || !data) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  await logAudit(db, {
    user_id: userId, actor: "user", action_type: "task_updated",
    target_type: "task", target_id: id,
    reasoning: `Updated: ${Object.keys(updates).join(", ")}`,
  });

  return NextResponse.json(data);
}
