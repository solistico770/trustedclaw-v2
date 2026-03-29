import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { status, reason, next_action_date, user_id } = await req.json();
  if (!status || !user_id) return NextResponse.json({ error: "status and user_id required" }, { status: 400 });

  const db = createServiceClient();
  const update: Record<string, unknown> = { status };
  if (status === "closed") update.closed_at = new Date().toISOString();
  if (status === "closed" || status === "merged") update.next_scan_at = null;
  if (status === "scheduled" && next_action_date) update.next_action_date = next_action_date;

  await db.from("cases").update(update).eq("id", id);
  await logAudit(db, { user_id, actor: "user", action_type: `case_${status}`, target_type: "case", target_id: id, reasoning: reason });
  return NextResponse.json({ success: true });
}
