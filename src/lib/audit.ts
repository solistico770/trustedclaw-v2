import { SupabaseClient } from "@supabase/supabase-js";

export async function logAudit(
  db: SupabaseClient,
  p: { user_id: string; actor: string; action_type: string; target_type: string; target_id?: string; reasoning?: string; metadata?: Record<string, unknown> }
) {
  const { error } = await db.from("audit_logs").insert({
    user_id: p.user_id, actor: p.actor, action_type: p.action_type,
    target_type: p.target_type, target_id: p.target_id, reasoning: p.reasoning, metadata: p.metadata || {},
  });
  if (error) console.error("[audit]", error.message);
}
