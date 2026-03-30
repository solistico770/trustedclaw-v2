import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/require-admin";
import { logAudit } from "@/lib/audit";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const db = auth.supabase;
  const userId = auth.user.id;
  const { id } = await params;

  const { data, error } = await db.from("tasks")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("id", id).eq("user_id", userId)
    .select("*").single();

  if (error || !data) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  await logAudit(db, {
    user_id: userId, actor: "user", action_type: "task_closed",
    target_type: "task", target_id: id,
    reasoning: `Closed: ${data.title}`,
  });

  return NextResponse.json(data);
}
