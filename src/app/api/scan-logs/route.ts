import { NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/require-admin";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const userId = auth.user.id;

  const db = createServiceClient();
  const { data, error } = await db.from("scan_logs").select("*").eq("user_id", userId).order("run_at", { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
