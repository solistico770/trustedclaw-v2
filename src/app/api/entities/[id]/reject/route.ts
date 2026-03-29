import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createServiceClient();
  await db.from("entities").update({ status: "rejected" }).eq("id", id);
  return NextResponse.json({ success: true });
}
