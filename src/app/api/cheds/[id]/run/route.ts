import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/require-admin";
import { evaluateChed } from "@/lib/agent-scanner";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const { user, supabase } = auth;
  const { id } = await params;

  const { data: ched } = await supabase.from("cheds").select("*").eq("id", id).eq("user_id", user.id).single();
  if (!ched) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const result = await evaluateChed(supabase, ched, user.id, "manual");
  return NextResponse.json(result);
}
