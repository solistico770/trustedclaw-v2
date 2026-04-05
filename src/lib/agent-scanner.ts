import { SupabaseClient } from "@supabase/supabase-js";
import { callAgent, triageSignals, AgentCommand, Skill, TriageDecision } from "./gemini-agent";
import { logAudit } from "./audit";
import { getScanIntervalSeconds } from "./scan-intervals";
import { buildBatchDossiers } from "./entity-dossier";

// ─── TRIAGE TYPES ───────────────────────────────────────────────────────────

export type TriageResult = {
  signals_triaged: number;
  signals_assigned: number;
  signals_ignored: number;
  cases_created: number;
  tokens: number;
  duration_ms: number;
  status: "success" | "skipped" | "failed";
  error?: string;
};

// ─── SIGNAL TRIAGE (Pass 1) ─────────────────────────────────────────────────

export async function triagePendingSignals(db: SupabaseClient, userId: string): Promise<TriageResult> {
  try {
    // Fetch pending signals (limit 20)
    const { data: pendingSignals } = await db.from("signals")
      .select("id, raw_payload, sender_identifier, gate_id, occurred_at, gates(type)")
      .eq("user_id", userId).eq("status", "pending")
      .order("occurred_at", { ascending: true })
      .limit(50);

    if (!pendingSignals || pendingSignals.length === 0) {
      return { signals_triaged: 0, signals_assigned: 0, signals_ignored: 0, cases_created: 0, tokens: 0, duration_ms: 0, status: "skipped" };
    }

    // Claim these signals to prevent re-processing
    const claimedIds = pendingSignals.map(s => s.id);
    await db.from("signals").update({ status: "triaging" }).in("id", claimedIds);

    // Fetch open case summaries
    const { data: openCasesRaw } = await db.from("cases")
      .select("id, case_number, title, summary, importance")
      .eq("user_id", userId)
      .in("status", ["open", "action_needed", "in_progress", "escalated"])
      .order("importance", { ascending: false }).limit(15);

    // Fetch first signal for each case for context
    const openCases = [];
    for (const oc of openCasesRaw || []) {
      const { data: firstSig } = await db.from("signals")
        .select("raw_payload, sender_identifier")
        .eq("case_id", oc.id)
        .order("occurred_at", { ascending: true })
        .limit(1).single();
      const { count } = await db.from("signals").select("*", { count: "exact", head: true }).eq("case_id", oc.id);
      openCases.push({
        ...oc,
        first_signal: firstSig?.raw_payload?.content || null,
        first_sender: firstSig?.sender_identifier || null,
        signal_count: count || 0,
      });
    }

    // Get context prompt + identity
    const { data: settings } = await db.from("user_settings").select("context_prompt, admin_entity_id, identity").eq("user_id", userId).single();
    let contextPrompt = "";

    const identity = (settings?.identity || {}) as Record<string, string>;
    if (identity.name || identity.role || identity.business) {
      const parts = [];
      if (identity.name) parts.push(`Name: ${identity.name}`);
      if (identity.role) parts.push(`Role: ${identity.role}`);
      if (identity.business) parts.push(`Business: ${identity.business}`);
      if (identity.phone) parts.push(`Phone: ${identity.phone}`);
      contextPrompt += `WHO I AM:\n${parts.join("\n")}\n\n`;
    }

    if (settings?.admin_entity_id) {
      const { data: admin } = await db.from("entities").select("canonical_name, type").eq("id", settings.admin_entity_id).single();
      if (admin) {
        contextPrompt += `ADMIN IDENTITY: "${admin.canonical_name}". All cases managed on behalf of ${admin.canonical_name}.\n\n`;
      }
    }

    contextPrompt += settings?.context_prompt || "You are an operational agent.";

    // Build signal input for AI
    // sender_identifier is the stable JID (deterministic), sender_name is the display name (human-readable)
    // Both are provided so the LLM can match entities by stable ID and understand context by name
    const signalInput = pendingSignals.map(s => ({
      id: s.id,
      sender_id: s.sender_identifier || "Unknown",
      sender_name: s.raw_payload?.sender_name || s.sender_identifier || "Unknown",
      content: s.raw_payload?.content || JSON.stringify(s.raw_payload),
      gate_type: (s.gates as unknown as { type: string } | null)?.type || "unknown",
      is_group: !!s.raw_payload?.is_group,
      group_name: s.raw_payload?.group_name || null,
      timestamp: s.occurred_at,
    }));

    // Collect auto-resolved entity IDs from signal_entities for this batch
    const { data: batchEntityLinks } = await db.from("signal_entities")
      .select("signal_id, entity_id")
      .in("signal_id", claimedIds);
    const resolvedEntityIds = [...new Set((batchEntityLinks || []).map(l => l.entity_id))];
    const entityDossiersText = resolvedEntityIds.length > 0
      ? await buildBatchDossiers(db, resolvedEntityIds)
      : "";

    // Call AI triage
    const { response, raw, tokens, durationMs } = await triageSignals(contextPrompt, signalInput, openCases, entityDossiersText);

    // Execute decisions
    const result = await executeTriageDecisions(db, userId, response.decisions, pendingSignals, settings?.admin_entity_id);

    // Log case event for triage
    await db.from("case_events").insert({
      case_id: result.firstCaseId || (openCasesRaw?.[0]?.id) || null,
      user_id: userId,
      event_type: "signal_triage",
      in_context: { signals: signalInput, open_cases: openCases },
      out_raw: response,
      api_commands: response.decisions,
      commands_executed: result.executionResults,
      tokens_used: tokens,
      model_used: "gemini-2.5-flash",
      duration_ms: durationMs,
      status: "success",
    });

    return {
      signals_triaged: pendingSignals.length,
      signals_assigned: result.assigned,
      signals_ignored: result.ignored,
      cases_created: result.casesCreated,
      tokens,
      duration_ms: durationMs,
      status: "success",
    };
  } catch (err) {
    return {
      signals_triaged: 0, signals_assigned: 0, signals_ignored: 0, cases_created: 0,
      tokens: 0, duration_ms: 0, status: "failed", error: String(err),
    };
  }
}

async function executeTriageDecisions(
  db: SupabaseClient,
  userId: string,
  decisions: TriageDecision[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pendingSignals: any[],
  adminEntityId?: string | null,
) {
  let assigned = 0;
  let ignored = 0;
  let casesCreated = 0;
  let firstCaseId: string | null = null;
  const executionResults: Array<{ signal_id: string; action: string; status: string; detail?: string }> = [];
  const groupCases = new Map<string, string>(); // group_key → case_id

  for (const decision of decisions) {
    try {
      if (decision.action === "assign" && decision.case_id) {
        // Assign signal to existing case
        await db.from("signals").update({
          case_id: decision.case_id,
          status: "processed",
          processing_decision: { action: "assign", case_id: decision.case_id, reasoning: decision.reasoning },
        }).eq("id", decision.signal_id);

        // Update case signal count
        const { count } = await db.from("signals").select("*", { count: "exact", head: true }).eq("case_id", decision.case_id);
        await db.from("cases").update({
          message_count: count || 0,
          last_message_at: new Date().toISOString(),
          next_scan_at: new Date().toISOString(),
        }).eq("id", decision.case_id);

        if (!firstCaseId) firstCaseId = decision.case_id;
        assigned++;
        executionResults.push({ signal_id: decision.signal_id, action: "assign", status: "ok", detail: decision.case_id.slice(0, 8) });

        await logAudit(db, {
          user_id: userId, actor: "agent", action_type: "signal_triaged",
          target_type: "signal", target_id: decision.signal_id,
          reasoning: `Assigned to case: ${decision.reasoning}`,
        });

      } else if (decision.action === "create_case") {
        // Check if group_key already created a case
        let caseId: string | null = null;
        if (decision.group_key && groupCases.has(decision.group_key)) {
          caseId = groupCases.get(decision.group_key)!;
        } else {
          // Create new case WITH metadata from AI
          const now = new Date().toISOString();
          const { data: newCase } = await db.from("cases").insert({
            user_id: userId,
            status: "open",
            title: decision.title || null,
            summary: decision.summary || null,
            urgency: decision.urgency || 3,
            importance: decision.importance || 3,
            message_count: 1,
            first_message_at: now,
            last_message_at: now,
            next_scan_at: now,
          }).select("id").single();
          caseId = newCase?.id || null;
          if (caseId) {
            casesCreated++;
            if (decision.group_key) groupCases.set(decision.group_key, caseId);

            // Create entities from triage
            if (decision.entities && Array.isArray(decision.entities)) {
              for (const ent of decision.entities) {
                if (!ent.name || ent.name.length < 2) continue;
                try {
                  // Extract wa_jid from phone if available
                  const entWaJid = ent.phone ? `${ent.phone}@c.us` : null;
                  let entEntityId: string | null = null;

                  // Check by wa_jid first, then name
                  if (entWaJid) {
                    const { data: byJid } = await db.from("entities")
                      .select("id").eq("user_id", userId).eq("wa_jid", entWaJid).limit(1).single();
                    if (byJid) entEntityId = byJid.id;
                  }
                  if (!entEntityId) {
                    const { data: byName } = await db.from("entities")
                      .select("id").eq("user_id", userId).ilike("canonical_name", ent.name).limit(1).single();
                    if (byName) entEntityId = byName.id;
                  }

                  if (entEntityId) {
                    await db.from("case_entities").upsert(
                      { case_id: caseId, entity_id: entEntityId, role: ent.role || "mentioned" },
                      { onConflict: "case_id,entity_id" }
                    );
                  } else {
                    const insertData: Record<string, unknown> = {
                      user_id: userId, type: ent.type || "person",
                      canonical_name: ent.name, status: "active",
                      phone: ent.phone || null,
                    };
                    if (entWaJid) insertData.wa_jid = entWaJid;

                    const { data: newEnt } = await db.from("entities").insert(insertData).select("id").single();
                    if (newEnt) {
                      entEntityId = newEnt.id;
                      await db.from("case_entities").upsert(
                        { case_id: caseId, entity_id: newEnt.id, role: ent.role || "mentioned" },
                        { onConflict: "case_id,entity_id" }
                      );
                    }
                  }

                  // Link signal to entity via signal_entities
                  if (entEntityId) {
                    await db.from("signal_entities").upsert(
                      { signal_id: decision.signal_id, entity_id: entEntityId, resolution_method: "triage" },
                      { onConflict: "signal_id,entity_id" }
                    );
                  }
                } catch { /* entity creation is best-effort */ }
              }
            }

            // Auto-link admin entity if applicable
            if (adminEntityId) {
              const signal = pendingSignals.find(s => s.id === decision.signal_id);
              if (signal?.gate_id) {
                const { data: gate } = await db.from("gates").select("metadata").eq("id", signal.gate_id).single();
                if (gate?.metadata?.is_admin_gate) {
                  await db.from("case_entities").upsert(
                    { case_id: caseId, entity_id: adminEntityId, role: "primary" },
                    { onConflict: "case_id,entity_id" }
                  );
                }
              }
            }
          }
        }

        if (caseId) {
          await db.from("signals").update({
            case_id: caseId,
            status: "processed",
            processing_decision: { action: "create_case", group_key: decision.group_key, reasoning: decision.reasoning },
          }).eq("id", decision.signal_id);

          // Update case count
          const { count } = await db.from("signals").select("*", { count: "exact", head: true }).eq("case_id", caseId);
          await db.from("cases").update({ message_count: count || 0, last_message_at: new Date().toISOString() }).eq("id", caseId);

          if (!firstCaseId) firstCaseId = caseId;
          assigned++;
        }

        executionResults.push({ signal_id: decision.signal_id, action: "create_case", status: "ok", detail: caseId?.slice(0, 8) });

        await logAudit(db, {
          user_id: userId, actor: "agent", action_type: "signal_triaged",
          target_type: "signal", target_id: decision.signal_id,
          reasoning: `New case: ${decision.reasoning}`,
        });

      } else if (decision.action === "ignore") {
        await db.from("signals").update({
          status: "ignored",
          processing_decision: { action: "ignore", reasoning: decision.reasoning },
        }).eq("id", decision.signal_id);

        ignored++;
        executionResults.push({ signal_id: decision.signal_id, action: "ignore", status: "ok" });

        await logAudit(db, {
          user_id: userId, actor: "agent", action_type: "signal_triaged",
          target_type: "signal", target_id: decision.signal_id,
          reasoning: `Ignored: ${decision.reasoning}`,
        });
      }
    } catch (e) {
      executionResults.push({ signal_id: decision.signal_id, action: decision.action, status: "error", detail: String(e).slice(0, 100) });
    }
  }

  return { assigned, ignored, casesCreated, firstCaseId, executionResults };
}

// ─── CASE REVIEW (Pass 2) ──────────────────────────────────────────────────

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

    // 2. Get signals (last 20) — was messages
    const { data: signals } = await db.from("signals")
      .select("raw_payload, sender_identifier, occurred_at, gate_id")
      .eq("case_id", caseId)
      .order("occurred_at", { ascending: true })
      .limit(20);

    const sigList = (signals || []).map(m => ({
      sender_id: m.sender_identifier || "Unknown",
      sender_name: m.raw_payload?.sender_name || m.sender_identifier || "Unknown",
      content: m.raw_payload?.content || JSON.stringify(m.raw_payload),
      timestamp: m.occurred_at,
    }));

    // 3. Get context prompt + identity + admin entity
    const { data: settings } = await db.from("user_settings").select("context_prompt, admin_entity_id, identity").eq("user_id", userId).single();
    let contextPrompt = "";

    // Build "who am I" from structured identity
    const identity = (settings?.identity || {}) as Record<string, string>;
    if (identity.name || identity.role || identity.business) {
      const parts = [];
      if (identity.name) parts.push(`Name: ${identity.name}`);
      if (identity.role) parts.push(`Role: ${identity.role}`);
      if (identity.business) parts.push(`Business: ${identity.business}`);
      if (identity.phone) parts.push(`Phone: ${identity.phone}`);
      if (identity.email) parts.push(`Email: ${identity.email}`);
      if (identity.notes) parts.push(`Notes: ${identity.notes}`);
      contextPrompt += `WHO I AM (the owner of this system):\n${parts.join("\n")}\n\n`;
    }

    if (settings?.admin_entity_id) {
      const { data: admin } = await db.from("entities").select("canonical_name, type").eq("id", settings.admin_entity_id).single();
      if (admin) {
        contextPrompt += `ADMIN IDENTITY: You work for "${admin.canonical_name}". All cases are managed on behalf of ${admin.canonical_name}.\n\n`;
      }
    }

    contextPrompt += settings?.context_prompt || "You are an operational agent.";

    // Get entity type contexts (#3 — entity group context)
    const { data: entityTypes } = await db.from("entity_types").select("slug, display_name, context").eq("user_id", userId);
    if (entityTypes && entityTypes.some(t => t.context)) {
      contextPrompt += "\n\n--- ENTITY TYPE CONTEXTS ---\n";
      for (const et of entityTypes) {
        if (et.context) contextPrompt += `${et.display_name} (${et.slug}): ${et.context}\n`;
      }
    }

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

    const prevPulled = lastEvent?.skills_pulled || [];
    const pulledInstructions = skills
      .filter(s => prevPulled.includes(s.name))
      .map(s => `SKILL: ${s.name}\n${s.instructions}`);

    // 6. Get open cases for merge
    const { data: openCasesRaw } = await db.from("cases")
      .select("id, case_number, title, summary, importance, message_count")
      .eq("user_id", userId).not("id", "eq", caseId)
      .in("status", ["open", "action_needed", "in_progress", "escalated"])
      .order("importance", { ascending: false }).limit(10);

    const openCases = [];
    for (const oc of openCasesRaw || []) {
      const { data: firstSig } = await db.from("signals")
        .select("raw_payload, sender_identifier")
        .eq("case_id", oc.id)
        .order("occurred_at", { ascending: true })
        .limit(1).single();
      openCases.push({
        ...oc,
        first_message: firstSig?.raw_payload?.content || null,
        first_sender: firstSig?.sender_identifier || null,
      });
    }

    // 6.5 Get existing entities + build dossiers for LLM context
    const { data: existingCaseEntities } = await db.from("case_entities")
      .select("entity_id, entities(canonical_name, type)")
      .eq("case_id", caseId);
    const existingEntityNames = (existingCaseEntities || [])
      .map((ce: Record<string, unknown>) => {
        const ent = ce.entities as Record<string, string> | null;
        return ent?.canonical_name;
      })
      .filter(Boolean) as string[];

    // Build entity dossiers for case scan context
    const caseEntityIds = (existingCaseEntities || [])
      .map((ce: Record<string, unknown>) => ce.entity_id as string)
      .filter(Boolean);
    const caseDossiersText = caseEntityIds.length > 0
      ? await buildBatchDossiers(db, caseEntityIds)
      : "";

    // 6.6 Get open tasks for this case
    const { data: openTasks } = await db.from("tasks")
      .select("id, title, scheduled_at, due_at")
      .eq("case_id", caseId).eq("status", "open");

    // 6.7 Optional: pull full conversation context from EC2 listener via Supabase
    let extraConversationContext = "";
    try {
      const gateIdsFromSignals = [...new Set((signals || []).map(s => (s as Record<string, unknown>).gate_id).filter(Boolean))];
      for (const gateId of gateIdsFromSignals) {
        const { data: gate } = await db.from("gates").select("metadata").eq("id", gateId).single();
        if (gate?.metadata?.listener_active) {
          const { data: cmd } = await db.from("listener_commands").insert({
            user_id: userId, command: "pull_conversations",
            params: { since: "24h" },
          }).select("id").single();
          if (cmd) {
            // Poll for response (max 10s)
            for (let i = 0; i < 20; i++) {
              const { data: resp } = await db.from("listener_responses")
                .select("data").eq("command_id", cmd.id).limit(1).single();
              if (resp?.data) {
                const convos = (resp.data as Record<string, unknown>).conversations as Array<{ chat_name: string; messages: Array<{ sender: string; content: string; timestamp: string }> }>;
                if (Array.isArray(convos)) {
                  extraConversationContext = "\n\n--- FULL CONVERSATION CONTEXT (from listener) ---\n" +
                    convos.map(c => `Chat: ${c.chat_name}\n${(c.messages || []).map(m => `  [${m.sender}]: ${m.content}`).join("\n")}`).join("\n\n");
                }
                break;
              }
              await new Promise(r => setTimeout(r, 500));
            }
          }
          break; // Only pull from first active listener gate
        }
      }
    } catch (err) {
      // Graceful degradation: scan continues without extra context
      console.warn("[scanCase] Listener pull failed (non-blocking):", err);
    }

    // Append extra context to signal list if available
    if (extraConversationContext) {
      sigList.push({ sender_id: "SYSTEM", sender_name: "SYSTEM", content: extraConversationContext, timestamp: new Date().toISOString() });
    }

    // 7. Call agent
    const { response, raw, tokens, durationMs, skillsPulled } = await callAgent(
      contextPrompt, sigList, openCases, skills, pulledInstructions, existingEntityNames, previousSummary, openTasks || [], caseDossiersText
    );

    // 8. Second pass for pulled skills
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
        contextPrompt, sigList, openCases, skills,
        [...pulledInstructions, ...newPulledInstructions], existingEntityNames, previousSummary, openTasks || [], caseDossiersText
      );

      finalResponse = secondPass.response;
      finalRaw = secondPass.raw;
      totalTokens += secondPass.tokens;
      totalDuration += secondPass.durationMs;
    }

    // 9. Execute commands
    const executionResults = await executeCommands(db, caseId, userId, finalResponse.commands);
    commandsExecuted.push(...executionResults);

    // 10. Update scan timing
    const { data: updatedCase } = await db.from("cases").select("urgency, importance, next_scan_at").eq("id", caseId).single();
    const agentSetNextScan = finalResponse.commands.some(c => c.type === "set_next_scan");

    const updateData: Record<string, unknown> = { last_scanned_at: new Date().toISOString() };

    if (!agentSetNextScan) {
      const urg = updatedCase?.urgency || 3;
      const imp = updatedCase?.importance || 3;
      const intervalSec = getScanIntervalSeconds(urg, imp);
      updateData.next_scan_at = new Date(Date.now() + intervalSec * 1000).toISOString();
    }

    await db.from("cases").update(updateData).eq("id", caseId);

    // 11. Save CaseEvent
    const eventType = caseData.status === "pending" ? "initial_scan" :
      triggeredBy === "manual" ? "manual_scan" : "scheduled_scan";

    await db.from("case_events").insert({
      case_id: caseId,
      user_id: userId,
      event_type: eventType,
      in_context: { context_prompt: contextPrompt, signals: sigList, open_cases: openCases, skills_map: skills.map(s => ({ name: s.name, summary: s.summary, auto_attach: s.auto_attach })), previous_summary: previousSummary, open_tasks: openTasks },
      out_raw: finalResponse,
      api_commands: finalResponse.commands,
      commands_executed: commandsExecuted,
      skills_pulled: allPulledSkills,
      empowerment_line: finalResponse.commands.find(c => c.type === "set_empowerment_line")?.value || null,
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

// ─── COMMAND EXECUTION ──────────────────────────────────────────────────────

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
        case "set_empowerment_line":
          results.push({ type: "set_empowerment_line", status: "ok", detail: cmd.value.slice(0, 100) });
          break;
        case "create_entity":
        case "propose_entity": {
          // create_entity: creates new entity + links to case
          // propose_entity: backward compat alias for create_entity
          const normalized = cmd.name.trim();
          if (!normalized || normalized.length < 2) {
            results.push({ type: cmd.type, status: "skipped", detail: "name too short" });
            break;
          }

          // Check for existing entity: first by wa_jid (strongest), then by name
          const cmdWaJid = "wa_jid" in cmd ? cmd.wa_jid : undefined;
          const cmdTgUserId = "tg_user_id" in cmd ? cmd.tg_user_id : undefined;
          let existingId: string | null = null;

          if (cmdWaJid) {
            const { data: byJid } = await db.from("entities")
              .select("id").eq("user_id", userId).eq("wa_jid", cmdWaJid).limit(1).single();
            if (byJid) existingId = byJid.id;
          }
          if (!existingId && cmdTgUserId) {
            const { data: byTg } = await db.from("entities")
              .select("id").eq("user_id", userId).eq("tg_user_id", cmdTgUserId).limit(1).single();
            if (byTg) existingId = byTg.id;
          }
          if (!existingId) {
            const { data: byName } = await db.from("entities")
              .select("id").eq("user_id", userId)
              .or(`canonical_name.ilike.${normalized},canonical_name.ilike.%${normalized}%`)
              .limit(1);
            if (byName && byName.length > 0) existingId = byName[0].id;
          }

          let entityId: string;
          if (existingId) {
            entityId = existingId;
            await db.from("case_entities").upsert({ case_id: caseId, entity_id: existingId, role: cmd.role || "mentioned" }, { onConflict: "case_id,entity_id" });
            results.push({ type: cmd.type, status: "linked_existing", detail: normalized });
          } else {
            // Validate entity_type against entity_types table (fallback to "other")
            let entityType = cmd.entity_type || "other";
            const { data: validType } = await db.from("entity_types")
              .select("slug").eq("user_id", userId).eq("slug", entityType).limit(1).single();
            if (!validType) entityType = "other";

            const insertData: Record<string, unknown> = {
              user_id: userId, type: entityType, canonical_name: normalized, status: "active",
            };
            if ("phone" in cmd && cmd.phone) insertData.phone = cmd.phone;
            if ("email" in cmd && cmd.email) insertData.email = cmd.email;
            if ("whatsapp_number" in cmd && cmd.whatsapp_number) insertData.whatsapp_number = cmd.whatsapp_number;
            if ("telegram_handle" in cmd && cmd.telegram_handle) insertData.telegram_handle = cmd.telegram_handle;
            if (cmdWaJid) insertData.wa_jid = cmdWaJid;
            if (cmdTgUserId) insertData.tg_user_id = cmdTgUserId;

            const { data: ne } = await db.from("entities").insert(insertData).select("id").single();
            entityId = ne?.id || "";
            if (ne) await db.from("case_entities").upsert({ case_id: caseId, entity_id: ne.id, role: cmd.role || "mentioned" }, { onConflict: "case_id,entity_id" });
            results.push({ type: cmd.type, status: "created", detail: normalized });
          }

          // Create signal_entities links for all case signals
          if (entityId) {
            const resMethod = cmd.type === "create_entity" ? "scan" : "triage";
            const { data: caseSignals } = await db.from("signals").select("id").eq("case_id", caseId);
            for (const sig of caseSignals || []) {
              await db.from("signal_entities").upsert(
                { signal_id: sig.id, entity_id: entityId, resolution_method: resMethod },
                { onConflict: "signal_id,entity_id" }
              );
            }
          }
          break;
        }
        case "attach_entity": {
          // Link an existing entity to this case — no creation
          let attachEntityId = cmd.entity_id;
          if (!attachEntityId && cmd.name) {
            const { data: found } = await db.from("entities")
              .select("id").eq("user_id", userId)
              .ilike("canonical_name", cmd.name.trim())
              .limit(1).single();
            attachEntityId = found?.id;
          }
          if (!attachEntityId) {
            results.push({ type: "attach_entity", status: "not_found", detail: cmd.name || cmd.entity_id || "no identifier" });
            break;
          }
          await db.from("case_entities").upsert({ case_id: caseId, entity_id: attachEntityId, role: cmd.role || "mentioned" }, { onConflict: "case_id,entity_id" });
          // Create signal_entities links for case signals
          const { data: attachSignals } = await db.from("signals").select("id").eq("case_id", caseId);
          for (const sig of attachSignals || []) {
            await db.from("signal_entities").upsert(
              { signal_id: sig.id, entity_id: attachEntityId, resolution_method: "scan" },
              { onConflict: "signal_id,entity_id" }
            );
          }
          results.push({ type: "attach_entity", status: "linked", detail: attachEntityId });
          break;
        }
        case "merge_into": {
          // Move signals (was messages)
          await db.from("signals").update({ case_id: cmd.target_case_id }).eq("case_id", caseId);
          // Move tasks
          await db.from("tasks").update({ case_id: cmd.target_case_id }).eq("case_id", caseId);
          // Copy entities
          const { data: srcEnts } = await db.from("case_entities").select("entity_id, role").eq("case_id", caseId);
          for (const ce of srcEnts || []) {
            await db.from("case_entities").upsert({ case_id: cmd.target_case_id, entity_id: ce.entity_id, role: ce.role }, { onConflict: "case_id,entity_id" });
          }
          const { count } = await db.from("signals").select("*", { count: "exact", head: true }).eq("case_id", cmd.target_case_id);
          await db.from("cases").update({ message_count: count || 0, last_message_at: new Date().toISOString(), next_scan_at: new Date().toISOString() }).eq("id", cmd.target_case_id);
          await db.from("cases").update({ status: "merged", merged_into_case_id: cmd.target_case_id, next_scan_at: null, closed_at: new Date().toISOString() }).eq("id", caseId);
          results.push({ type: "merge_into", status: "ok", detail: cmd.target_case_id.slice(0, 8) });
          return results; // stop processing
        }
        case "pull_skill":
          results.push({ type: "pull_skill", status: "ok", detail: cmd.skill_name });
          break;
        case "create_task": {
          // Auto-create entity
          const { data: entity } = await db.from("entities").insert({
            user_id: userId, type: "task", canonical_name: cmd.title, status: "active",
          }).select("id").single();
          const entityId = entity?.id || null;

          const { data: task } = await db.from("tasks").insert({
            user_id: userId, case_id: caseId, entity_id: entityId,
            title: cmd.title, description: cmd.description || null,
            scheduled_at: cmd.scheduled_at || null, due_at: cmd.due_at || null,
          }).select("id").single();

          if (entityId) {
            await db.from("case_entities").upsert(
              { case_id: caseId, entity_id: entityId, role: "related" },
              { onConflict: "case_id,entity_id" }
            );
          }
          results.push({ type: "create_task", status: "ok", detail: `${cmd.title} (${task?.id?.slice(0, 8)})` });
          break;
        }
        case "close_task": {
          const { error: closeErr } = await db.from("tasks")
            .update({ status: "closed", closed_at: new Date().toISOString() })
            .eq("id", cmd.task_id).eq("case_id", caseId);
          results.push({ type: "close_task", status: closeErr ? "error" : "ok", detail: cmd.task_id.slice(0, 8) });
          break;
        }
        case "update_task": {
          const taskUpdates: Record<string, unknown> = {};
          if (cmd.title) taskUpdates.title = cmd.title;
          if (cmd.scheduled_at !== undefined) taskUpdates.scheduled_at = cmd.scheduled_at;
          if (cmd.due_at !== undefined) taskUpdates.due_at = cmd.due_at;
          const { error: updateErr } = await db.from("tasks")
            .update(taskUpdates).eq("id", cmd.task_id).eq("case_id", caseId);
          results.push({ type: "update_task", status: updateErr ? "error" : "ok", detail: cmd.task_id.slice(0, 8) });
          break;
        }
      }
    } catch (e) {
      results.push({ type: cmd.type, status: "error", detail: String(e).slice(0, 100) });
    }
  }

  if (Object.keys(updates).length > 0) {
    const { error: updateError } = await db.from("cases").update(updates).eq("id", caseId);
    if (updateError) {
      console.error("[scanner] DB update failed:", updateError.message, "updates:", JSON.stringify(updates));
      results.push({ type: "db_update", status: "error", detail: updateError.message });
    } else {
      const { data: verify } = await db.from("cases").select("title, summary, urgency, importance").eq("id", caseId).single();
      if (verify && updates.title && verify.title !== updates.title) {
        console.error("[scanner] DB write mismatch! Expected title:", updates.title, "Got:", verify.title);
        results.push({ type: "db_verify", status: "mismatch", detail: `title: expected '${String(updates.title).slice(0,30)}' got '${verify.title?.slice(0,30)}'` });
      }
    }
  }

  return results;
}
