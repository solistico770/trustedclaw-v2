import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const { ids, action } = await req.json();
  if (!ids?.length || !action) return NextResponse.json({ error: "ids and action required" }, { status: 400 });

  const db = createServiceClient();
  const update = action === "approve"
    ? { status: "active", approved_at: new Date().toISOString() }
    : { status: "rejected" };

  await db.from("entities").update(update).in("id", ids);
  return NextResponse.json({ success: true, updated: ids.length });
}
