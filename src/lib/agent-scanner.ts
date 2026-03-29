import { SupabaseClient } from "@supabase/supabase-js";
import { callAgent, AgentCommand } from "./gemini-agent";
import { logAudit } from "./audit";

export async function scanCase(db: SupabaseClient, caseId: string, userId: string, triggeredBy: string) {
  // 1. Get case
  const { data: caseData } = await db.from("cases").select("*").eq("id", caseId).single();
  if (!caseData) throw new Error(`Case not found: ${caseId}`);

  // 2. Get messages (last 20)
  const { data: messages } = await db.from("messages")
    .select("raw_payload, sender_identifier, occurred_at")
    .eq("case_id", caseId)
    .order("occurred_at", { ascending: true })
    .limit(20);

  const msgList = (messages || []).map(m => ({
    sender: m.sender_identifier || m.raw_payload?.sender_name || "Unknown",
    content: m.raw_payload?.content || JSON.stringify(m.raw_payload),
    timestamp: m.occurred_at,
  }));

  // 3. Get context prompt
  const { data: settings } = await db.from("user_settings").select("context_prompt").eq("user_id", userId).single();
  const contextPrompt = settings?.context_prompt || "You are an operational agent. Classify cases by urgency and importance.";

  // 4. Get last CaseEvent summary (if exists)
  const { data: lastEvent } = await db.from("case_events")
    .select("out_raw")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  const previousSummary = lastEvent?.out_raw?.reasoning;

  // 5. Get other open cases (for merge)
  const { data: openCases } = await db.from("cases")
    .select("id, title, summary, importance, message_count")
    .eq("user_id", userId)
    .not("id", "eq", caseId)
    .in("status", ["open", "action_needed", "in_progress", "escalated"])
    .order("importance", { ascending: false })
    .limit(10);

  // 6. Call agent
  const { response, raw, tokens, durationMs } = await callAgent(
    contextPrompt, msgList, openCases || [], previousSummary
  );

  // 7. Save CaseEvent
  const eventType = caseData.status === "pending" ? "initial_scan" :
    triggeredBy === "manual" ? "manual_scan" : "scheduled_scan";

  await db.from("case_events").insert({
    case_id: caseId,
    user_id: userId,
    event_type: eventType,
    in_context: { context_prompt: contextPrompt, messages: msgList, open_cases: openCases, previous_summary: previousSummary },
    out_raw: response,
    api_commands: response.commands,
    tokens_used: tokens,
    model_used: "gemini-2.5-flash",
    duration_ms: durationMs,
  });

  // 8. Execute commands
  await executeCommands(db, caseId, userId, response.commands);

  // 9. Update last_scanned_at
  await db.from("cases").update({ last_scanned_at: new Date().toISOString() }).eq("id", caseId);

  await logAudit(db, {
    user_id: userId, actor: "agent", action_type: "case_scanned",
    target_type: "case", target_id: caseId,
    reasoning: response.reasoning,
    metadata: { decision: response.decision, tokens, duration_ms: durationMs },
  });

  return { decision: response.decision, reasoning: response.reasoning, commands: response.commands };
}

async function executeCommands(db: SupabaseClient, caseId: string, userId: string, commands: AgentCommand[]) {
  const updates: Record<string, unknown> = {};

  for (const cmd of commands) {
    switch (cmd.type) {
      case "set_status":
        updates.status = cmd.value;
        if (cmd.value === "closed") updates.closed_at = new Date().toISOString();
        break;
      case "set_urgency":
        updates.urgency = cmd.value;
        break;
      case "set_importance":
        updates.importance = cmd.value;
        break;
      case "set_title":
        updates.title = cmd.value;
        break;
      case "set_summary":
        updates.summary = cmd.value;
        break;
      case "set_next_scan": {
        updates.next_scan_at = cmd.value;
        break;
      }
      case "propose_entity": {
        // Check if entity already exists (active OR proposed — avoid duplicates)
        const { data: existing } = await db.from("entities")
          .select("id").eq("user_id", userId).ilike("canonical_name", cmd.name).in("status", ["active", "proposed"]).limit(1);

        if (existing && existing.length > 0) {
          // Link existing to case (upsert — no duplicate)
          await db.from("case_entities").upsert(
            { case_id: caseId, entity_id: existing[0].id, role: cmd.role || "mentioned" },
            { onConflict: "case_id,entity_id" }
          );
        } else {
          // Create proposed entity only if truly new
          const { data: newEntity } = await db.from("entities").insert({
            user_id: userId,
            type: cmd.entity_type || "other",
            canonical_name: cmd.name,
            status: "proposed",
          }).select("id").single();

          if (newEntity) {
            await db.from("case_entities").upsert(
              { case_id: caseId, entity_id: newEntity.id, role: cmd.role || "mentioned" },
              { onConflict: "case_id,entity_id" }
            );
          }
        }
        break;
      }
      case "merge_into": {
        // Move messages from this case to target
        await db.from("messages").update({ case_id: cmd.target_case_id }).eq("case_id", caseId);

        // Also move case_entities to target
        const { data: srcEntities } = await db.from("case_entities").select("entity_id, role").eq("case_id", caseId);
        for (const ce of srcEntities || []) {
          await db.from("case_entities").upsert(
            { case_id: cmd.target_case_id, entity_id: ce.entity_id, role: ce.role },
            { onConflict: "case_id,entity_id" }
          );
        }

        // Update target case message count
        const { count } = await db.from("messages").select("*", { count: "exact", head: true }).eq("case_id", cmd.target_case_id);
        await db.from("cases").update({
          message_count: count || 0,
          last_message_at: new Date().toISOString(),
          next_scan_at: new Date().toISOString(), // trigger re-scan on target
        }).eq("id", cmd.target_case_id);

        // Mark this case as merged IMMEDIATELY (don't rely on updates object)
        await db.from("cases").update({
          status: "merged",
          merged_into_case_id: cmd.target_case_id,
          next_scan_at: null,
          closed_at: new Date().toISOString(),
        }).eq("id", caseId);

        await logAudit(db, {
          user_id: userId, actor: "agent", action_type: "case_merged",
          target_type: "case", target_id: caseId,
          reasoning: cmd.reason,
          metadata: { merged_into: cmd.target_case_id },
        });

        // Return early — no further updates to this case
        return;
      }
    }
  }

  if (Object.keys(updates).length > 0) {
    await db.from("cases").update(updates).eq("id", caseId);
  }
}
