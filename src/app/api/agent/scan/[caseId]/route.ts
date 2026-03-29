import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { scanCase } from "@/lib/agent-scanner";

export async function POST(req: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const body = await req.json().catch(() => ({}));
  const userId = body.user_id;

  const db = createServiceClient();

  // Get case user_id if not provided
  let uid = userId;
  if (!uid) {
    const { data: c } = await db.from("cases").select("user_id").eq("id", caseId).single();
    uid = c?.user_id;
  }
  if (!uid) return NextResponse.json({ error: "Case not found" }, { status: 404 });

  try {
    const result = await scanCase(db, caseId, uid, "manual");
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
