import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/require-admin";
import { logAudit } from "@/lib/audit";
import { createServiceClient } from "@/lib/supabase-server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const { user } = auth;
  const { id } = await params;
  const { reason } = await req.json();

  const db = createServiceClient();
  await db.from("cases").update({ status: "closed", closed_at: new Date().toISOString(), next_scan_at: null }).eq("id", id);
  await logAudit(db, { user_id: user.id, actor: "user", action_type: "case_closed", target_type: "case", target_id: id, reasoning: reason });
  return NextResponse.json({ success: true });
}
