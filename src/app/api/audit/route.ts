import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/require-admin";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const userId = auth.user.id;

  const db = createServiceClient();
  const sp = req.nextUrl.searchParams;
  let query = db.from("audit_logs").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(200);
  const actor = sp.get("actor"); if (actor) query = query.eq("actor", actor);
  const actionType = sp.get("action_type"); if (actionType) query = query.eq("action_type", actionType);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
