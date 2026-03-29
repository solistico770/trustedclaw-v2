import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/require-admin";
import { createServiceClient } from "@/lib/supabase-server";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const { id } = await params;
  const db = createServiceClient();
  await db.from("entities").update({ status: "rejected" }).eq("id", id);
  return NextResponse.json({ success: true });
}
