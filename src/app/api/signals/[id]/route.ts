import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/require-admin";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const db = auth.supabase;
  const userId = auth.user.id;
  const { id } = await params;

  const { data, error } = await db.from("signals")
    .select("*, gates(type, display_name), cases(case_number, title)")
    .eq("id", id).eq("user_id", userId).single();

  if (error || !data) return NextResponse.json({ error: "Signal not found" }, { status: 404 });
  return NextResponse.json(data);
}
