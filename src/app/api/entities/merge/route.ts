import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/require-admin";
import { createServiceClient } from "@/lib/supabase-server";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const { user } = auth;
  const { source_id, target_id } = await req.json();
  if (!source_id || !target_id) return NextResponse.json({ error: "source_id, target_id required" }, { status: 400 });

  const db = createServiceClient();

  const { data: sourceLinks } = await db.from("case_entities").select("case_id, role").eq("entity_id", source_id);
  for (const link of sourceLinks || []) {
    await db.from("case_entities").upsert(
      { case_id: link.case_id, entity_id: target_id, role: link.role },
      { onConflict: "case_id,entity_id" }
    );
  }
  await db.from("case_entities").delete().eq("entity_id", source_id);
  await db.from("entities").update({ status: "archived" }).eq("id", source_id);

  await logAudit(db, {
    user_id: user.id, actor: "user", action_type: "entity_merged",
    target_type: "entity", target_id: source_id,
    reasoning: `Merged into ${target_id}`,
    metadata: { target_id },
  });

  return NextResponse.json({ success: true });
}
