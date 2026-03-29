import { SupabaseClient } from "@supabase/supabase-js";
import { callAgent, AgentCommand, Skill } from "./gemini-agent";
import { logAudit } from "./audit";

export type ScanCaseResult = {
  case_id: string;
  decision: string;
  reasoning: string;
  commands_count: number;
  commands_executed: Array<{ type: string; status: string; detail?: string }>;
  skills_pulled: string[];
  tokens: number;
  duration_ms: number;
  status: "success" | "failed";
  error?: string;
};

export async function scanCase(db: SupabaseClient, caseId: string, userId: string, triggeredBy: string): Promise<ScanCaseResult> {
  const commandsExecuted: Array<{ type: string; status: string; detail?: string }> = [];

  try {
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
    const contextPrompt = settings?.context_prompt || "You are an operational agent.";

    // 4. Get skills
    const { data: allSkills } = await db.from("skills")
      .select("id, name, summary, instructions, auto_attach")
      .eq("user_id", userId).eq("is_active", true);
    const skills: Skill[] = allSkills || [];

    // 5. Get last CaseEvent summary
    const { data: lastEvent } = await db.from("case_events")
      .select("out_raw, skills_pulled")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false })
      .limit(1).single();
    const previousSummary = lastEvent?.out_raw?.reasoning;

    // Get previously pulled skill instructions for continuity
    const prevPulled = lastEvent?.skills_pulled || [];
    const pulledInstructions = skills
      .filter(s => prevPulled.includes(s.name))
      .map(s => `SKILL: ${s.name}\n${s.instructions}`);

    // 6. Get open cases for merge
    const { data: openCases } = await db.from("cases")
      .select("id, title, summary, importance, message_count")
      .eq("user_id", userId).not("id", "eq", caseId)
      .in("status", ["open", "action_needed", "in_progress", "escalated"])
      .order("importance", { ascending: false }).limit(10);

    // 7. Call agent
    const { response, raw, tokens, durationMs, skillsPulled } = await callAgent(
      contextPrompt, msgList, openCases || [], skills, pulledInstructions, previousSummary
    );

    // 8. If skills were pulled, do a second call with full instructions
    let finalResponse = response;
    let finalRaw = raw;
    let totalTokens = tokens;
    let totalDuration = durationMs;
    const allPulledSkills = [...prevPulled, ...skillsPulled];

    if (skillsPulled.length > 0) {
      const newPulledInstructions = skills
        .filter(s => skillsPulled.includes(s.name))
        .map(s => `SKILL: ${s.name}\n${s.instructions}`);

      const secondPass = await callAgent(
        contextPrompt, msgList, openCases || [], skills,
        [...pulledInstructions, ...newPulledInstructions], previousSummary
      );

      finalResponse = secondPass.response;
      finalRaw = secondPass.raw;
      totalTokens += secondPass.tokens;
      totalDuration += secondPass.durationMs;
    }

    // 9. Execute commands
    const executionResults = await executeCommands(db, caseId, userId, finalResponse.commands);
    commandsExecuted.push(...executionResults);

    // 10. Update last_scanned_at
    await db.from("cases").update({ last_scanned_at: new Date().toISOString() }).eq("id", caseId);

    // 11. Save CaseEvent with full detail
    const eventType = caseData.status === "pending" ? "initial_scan" :
      triggeredBy === "manual" ? "manual_scan" : "scheduled_scan";

    await db.from("case_events").insert({
      case_id: caseId,
      user_id: userId,
      event_type: eventType,
      in_context: { context_prompt: contextPrompt, messages: msgList, open_cases: openCases, skills_map: skills.map(s => ({ name: s.name, summary: s.summary, auto_attach: s.auto_attach })), previous_summary: previousSummary },
      out_raw: finalResponse,
      api_commands: finalResponse.commands,
      commands_executed: commandsExecuted,
      skills_pulled: allPulledSkills,
      tokens_used: totalTokens,
      model_used: "gemini-2.5-flash",
      duration_ms: totalDuration,
      status: "success",
    });

    await logAudit(db, {
      user_id: userId, actor: "agent", action_type: "case_scanned",
      target_type: "case", target_id: caseId,
      reasoning: finalResponse.reasoning,
      metadata: { decision: finalResponse.decision, tokens: totalTokens, commands: commandsExecuted.length, skills_pulled: allPulledSkills },
    });

    return {
      case_id: caseId,
      decision: finalResponse.decision,
      reasoning: finalResponse.reasoning,
      commands_count: finalResponse.commands.length,
      commands_executed: commandsExecuted,
      skills_pulled: allPulledSkills,
      tokens: totalTokens,
      duration_ms: totalDuration,
      status: "success",
    };
  } catch (err) {
    // Save failed CaseEvent
    await db.from("case_events").insert({
      case_id: caseId, user_id: userId, event_type: "scheduled_scan",
      in_context: {}, out_raw: {}, api_commands: [],
      commands_executed: commandsExecuted,
      status: "failed", error_message: String(err),
      tokens_used: 0, duration_ms: 0,
    });

    return {
      case_id: caseId, decision: "error", reasoning: String(err),
      commands_count: 0, commands_executed: commandsExecuted,
      skills_pulled: [], tokens: 0, duration_ms: 0,
      status: "failed", error: String(err),
    };
  }
}

async function executeCommands(db: SupabaseClient, caseId: string, userId: string, commands: AgentCommand[]) {
  const results: Array<{ type: string; status: string; detail?: string }> = [];
  const updates: Record<string, unknown> = {};

  for (const cmd of commands) {
    try {
      switch (cmd.type) {
        case "set_status":
          updates.status = cmd.value;
          if (cmd.value === "closed") updates.closed_at = new Date().toISOString();
          results.push({ type: "set_status", status: "ok", detail: cmd.value });
          break;
        case "set_urgency":
          updates.urgency = cmd.value;
          results.push({ type: "set_urgency", status: "ok", detail: cmd.value });
          break;
        case "set_importance":
          updates.importance = cmd.value;
          results.push({ type: "set_importance", status: "ok", detail: String(cmd.value) });
          break;
        case "set_title":
          updates.title = cmd.value;
          results.push({ type: "set_title", status: "ok", detail: cmd.value.slice(0, 50) });
          break;
        case "set_summary":
          updates.summary = cmd.value;
          results.push({ type: "set_summary", status: "ok" });
          break;
        case "set_next_scan":
          updates.next_scan_at = cmd.value;
          results.push({ type: "set_next_scan", status: "ok", detail: cmd.value });
          break;
        case "propose_entity": {
          const { data: existing } = await db.from("entities")
            .select("id").eq("user_id", userId).ilike("canonical_name", cmd.name).in("status", ["active", "proposed"]).limit(1);
          if (existing && existing.length > 0) {
            await db.from("case_entities").upsert({ case_id: caseId, entity_id: existing[0].id, role: cmd.role || "mentioned" }, { onConflict: "case_id,entity_id" });
            results.push({ type: "propose_entity", status: "linked_existing", detail: cmd.name });
          } else {
            const { data: ne } = await db.from("entities").insert({ user_id: userId, type: cmd.entity_type || "other", canonical_name: cmd.name, status: "active" }).select("id").single();
            if (ne) await db.from("case_entities").upsert({ case_id: caseId, entity_id: ne.id, role: cmd.role || "mentioned" }, { onConflict: "case_id,entity_id" });
            results.push({ type: "propose_entity", status: "created", detail: cmd.name });
          }
          break;
        }
        case "merge_into": {
          await db.from("messages").update({ case_id: cmd.target_case_id }).eq("case_id", caseId);
          const { data: srcEnts } = await db.from("case_entities").select("entity_id, role").eq("case_id", caseId);
          for (const ce of srcEnts || []) {
            await db.from("case_entities").upsert({ case_id: cmd.target_case_id, entity_id: ce.entity_id, role: ce.role }, { onConflict: "case_id,entity_id" });
          }
          const { count } = await db.from("messages").select("*", { count: "exact", head: true }).eq("case_id", cmd.target_case_id);
          await db.from("cases").update({ message_count: count || 0, last_message_at: new Date().toISOString(), next_scan_at: new Date().toISOString() }).eq("id", cmd.target_case_id);
          await db.from("cases").update({ status: "merged", merged_into_case_id: cmd.target_case_id, next_scan_at: null, closed_at: new Date().toISOString() }).eq("id", caseId);
          results.push({ type: "merge_into", status: "ok", detail: cmd.target_case_id.slice(0, 8) });
          return results; // stop processing
        }
        case "pull_skill":
          results.push({ type: "pull_skill", status: "ok", detail: cmd.skill_name });
          break;
      }
    } catch (e) {
      results.push({ type: cmd.type, status: "error", detail: String(e).slice(0, 100) });
    }
  }

  if (Object.keys(updates).length > 0) {
    await db.from("cases").update(updates).eq("id", caseId);
  }

  return results;
}
