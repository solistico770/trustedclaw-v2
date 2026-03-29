import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { reason, user_id } = await req.json();
  if (!user_id) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  const db = createServiceClient();
  await db.from("cases").update({ status: "closed", closed_at: new Date().toISOString(), next_scan_at: null }).eq("id", id);
  await logAudit(db, { user_id, actor: "user", action_type: "case_closed", target_type: "case", target_id: id, reasoning: reason });
  return NextResponse.json({ success: true });
}
