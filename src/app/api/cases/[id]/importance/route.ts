import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/require-admin";
import { logAudit } from "@/lib/audit";
import { createServiceClient } from "@/lib/supabase-server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const { user } = auth;
  const { id } = await params;
  const { importance, reason } = await req.json();
  if (!importance) return NextResponse.json({ error: "importance required" }, { status: 400 });

  const db = createServiceClient();
  await db.from("cases").update({ importance }).eq("id", id);
  await logAudit(db, { user_id: user.id, actor: "user", action_type: "importance_override", target_type: "case", target_id: id, reasoning: reason });
  return NextResponse.json({ success: true });
}
