import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/require-admin";
import { logAudit } from "@/lib/audit";
import { createServiceClient } from "@/lib/supabase-server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const { user } = auth;
  const { id } = await params;
  const { status, reason, next_action_date } = await req.json();
  if (!status) return NextResponse.json({ error: "status required" }, { status: 400 });

  const db = createServiceClient();
  const update: Record<string, unknown> = { status };
  if (status === "closed") update.closed_at = new Date().toISOString();
  if (status === "closed" || status === "merged") update.next_scan_at = null;
  if (status === "scheduled" && next_action_date) update.next_action_date = next_action_date;

  await db.from("cases").update(update).eq("id", id);
  await logAudit(db, { user_id: user.id, actor: "user", action_type: `case_${status}`, target_type: "case", target_id: id, reasoning: reason });
  return NextResponse.json({ success: true });
}
