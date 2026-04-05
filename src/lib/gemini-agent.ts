import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export type AgentCommand =
  | { type: "set_status"; value: string }
  | { type: "set_urgency"; value: string }
  | { type: "set_importance"; value: number }
  | { type: "set_title"; value: string }
  | { type: "set_summary"; value: string }
  | { type: "set_next_scan"; value: string }
  | { type: "set_empowerment_line"; value: string }
  | { type: "create_entity"; name: string; entity_type: string; role: string; phone?: string; email?: string; whatsapp_number?: string; telegram_handle?: string; wa_jid?: string; tg_user_id?: string }
  | { type: "attach_entity"; entity_id?: string; name?: string; role: string }
  | { type: "propose_entity"; name: string; entity_type: string; role: string } // backward compat
  | { type: "merge_into"; target_case_id: string; reason: string }
  | { type: "pull_skill"; skill_name: string }
  | { type: "create_task"; title: string; description?: string; scheduled_at?: string; due_at?: string }
  | { type: "close_task"; task_id: string }
  | { type: "update_task"; task_id: string; title?: string; scheduled_at?: string; due_at?: string };

export type Skill = {
  id: string;
  name: string;
  summary: string;
  instructions: string;
  auto_attach: boolean;
};

export type AgentResponse = {
  decision: "standalone" | "merge";
  commands: AgentCommand[];
  reasoning: string;
};

export type TriageDecision = {
  signal_id: string;
  action: "assign" | "create_case" | "ignore";
  case_id?: string;
  group_key?: string;
  title?: string;
  summary?: string;
  urgency?: number;
  importance?: number;
  entities?: Array<{ name: string; type: string; role: string; phone?: string }>;
  reasoning: string;
};

export type TriageResponse = {
  decisions: TriageDecision[];
  reasoning: string;
};

// ─── SIGNAL TRIAGE ──────────────────────────────────────────────────────────

export async function triageSignals(
  contextPrompt: string,
  signals: Array<{ id: string; sender_id: string; sender_name: string; content: string; gate_type: string; is_group?: boolean; group_name?: string | null; timestamp: string }>,
  openCases: Array<{ id: string; case_number?: number; title: string; summary: string; importance: number; signal_count?: number; first_signal?: string | null; first_sender?: string | null }>,
  entityDossiers?: string,
): Promise<{ response: TriageResponse; raw: string; tokens: number; durationMs: number }> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" },
  });

  // Format: stable sender_id for entity matching + display name for context
  const signalsText = signals.map((s, i) => {
    const groupTag = s.is_group && s.group_name ? ` [group: ${s.group_name}]` : "";
    return `[Signal ${i + 1}] id=${s.id} | ${s.timestamp} | gate=${s.gate_type} | from=${s.sender_id} (${s.sender_name})${groupTag}: ${s.content}`;
  }).join("\n");

  const casesText = openCases.length > 0
    ? openCases.map(c => {
        const title = c.title || "(untitled)";
        const firstSig = c.first_signal ? ` — first signal from ${c.first_sender || "?"}: "${c.first_signal.slice(0, 100)}"` : "";
        return `- Case #${c.case_number || "?"} [${c.id}]: "${title}"${firstSig} (importance=${c.importance}, ${c.signal_count || 0} signals)`;
      }).join("\n")
    : "No open cases.";

  const prompt = `${contextPrompt}

---
SIGNAL TRIAGE MODE

You have ${signals.length} new pending signals to triage.

PENDING SIGNALS:
${signalsText}

EXISTING OPEN CASES:
${casesText}
${entityDossiers ? `\nKNOWN ENTITIES IN THIS BATCH:\n${entityDossiers}\n` : ""}
---
For each signal, decide ONE action:

1. "assign" — signal belongs to an existing case. Include "case_id".
2. "create_case" — new topic that needs tracking. MUST include:
   - "title": clear Hebrew/English title (what is this about)
   - "summary": 1-2 sentence description
   - "urgency": 1-5 (1=immediate action needed, 5=routine)
   - "importance": 1-5 (1=critical life/business impact, 5=minimal/noise)
   - "entities": array of people/companies mentioned: [{"name":"שם","type":"person","role":"primary","phone":"972..."}]
   - "group_key": if multiple signals belong to same new case, use same group_key
3. "ignore" — ONLY for: spam, bot messages, empty forwards, system notifications, or pure emoji/sticker messages.

Return JSON:
{
  "decisions": [
    { "signal_id": "<uuid>", "action": "assign", "case_id": "<uuid>", "reasoning": "..." },
    { "signal_id": "<uuid>", "action": "create_case", "group_key": "topic-key", "title": "כותרת", "summary": "תיאור", "urgency": 3, "importance": 3, "entities": [{"name":"שם","type":"person","role":"primary"}], "reasoning": "..." },
    { "signal_id": "<uuid>", "action": "ignore", "reasoning": "..." }
  ],
  "reasoning": "overall summary"
}

TRIAGE RULES:
- You are reading someone's REAL LIFE — understand context before deciding.
- FIRST classify: is this PERSONAL or BUSINESS?
  - Business: client/supplier/partner/work conversations → create_case if substantive
  - Personal: friends/family/social → ONLY create_case if significant (commitment, health, money, conflict)
  - Personal noise (memes, jokes, banter, "good morning" blasts, group reactions) → IGNORE
- A case = something worth TRACKING — not every message deserves one.
- Group signals from the SAME sender or SAME topic into ONE case using group_key.
- The "from" field is a STABLE IDENTIFIER (WA JID like "972501234567@c.us" or "33436521762932@lid"). Same from = same person, ALWAYS. Use this to match entities across signals.
- The name in parentheses is the display name — use it for the entity name, but match by the stable ID.
- Check existing cases before creating new ones — assign if the topic matches.
- Extract entities (people, companies, projects) with whatever contact info is available. For phone: extract digits from the stable ID if it looks like a phone number (e.g. "972501234567@c.us" → phone "972501234567").
- Direction "ME→" means the owner sent it — still relevant, assign or create case if it's about something substantive.
- IGNORE liberally: group chat banter, memes, forwarded jokes/news, social pleasantries, stickers, reactions, "lol", "+1", greetings with no ask.
- When in doubt about personal messages → IGNORE. When in doubt about business messages → CREATE.
- Every signal_id MUST appear in decisions.

Return ONLY valid JSON.`;

  const startTime = Date.now();
  const result = await model.generateContent(prompt);
  const durationMs = Date.now() - startTime;
  const raw = result.response.text();
  const tokens = result.response.usageMetadata?.totalTokenCount || 0;
  const response: TriageResponse = JSON.parse(raw);

  return { response, raw, tokens, durationMs };
}

// ─── CASE REVIEW (existing, updated for signals + tasks) ────────────────────

export async function callAgent(
  contextPrompt: string,
  signals: Array<{ sender_id: string; sender_name: string; content: string; timestamp: string }>,
  openCases: Array<{ id: string; case_number?: number; title: string; summary: string; importance: number; message_count: number; first_message?: string | null; first_sender?: string | null }>,
  skills: Skill[],
  pulledSkillInstructions: string[],
  existingEntityNames: string[],
  previousSummary?: string,
  openTasks?: Array<{ id: string; title: string; scheduled_at?: string | null; due_at?: string | null }>,
  entityDossiers?: string,
): Promise<{ response: AgentResponse; raw: string; tokens: number; durationMs: number; skillsPulled: string[] }> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" },
  });

  const signalsText = signals.map((m, i) => `[${i + 1}] ${m.timestamp} | from=${m.sender_id} (${m.sender_name}): ${m.content}`).join("\n");
  const casesText = openCases.length > 0
    ? openCases.map(c => {
        const title = c.title || "(untitled)";
        const firstMsg = c.first_message ? ` — first signal from ${c.first_sender || "?"}: "${c.first_message.slice(0, 100)}"` : "";
        return `- Case #${c.case_number || "?"} [${c.id}]: "${title}"${firstMsg} (importance=${c.importance}, ${c.message_count} signals)`;
      }).join("\n")
    : "No other open cases.";

  const existingEntitiesText = existingEntityNames.length > 0
    ? `\nALREADY CONNECTED ENTITIES (do NOT re-propose these): ${existingEntityNames.join(", ")}`
    : "";

  const tasksText = (openTasks && openTasks.length > 0)
    ? `\nOPEN TASKS FOR THIS CASE:\n${openTasks.map(t => {
        const sched = t.scheduled_at ? ` scheduled=${t.scheduled_at}` : "";
        const due = t.due_at ? ` due=${t.due_at}` : "";
        return `- [${t.id}] "${t.title}"${sched}${due}`;
      }).join("\n")}`
    : "";

  // Build skill map — show trigger conditions and suggestions for pull-on-demand skills
  const skillMap = skills.filter(s => !s.auto_attach && s.summary).map(s => {
    // Extract "SUGGESTS: x" from instructions if present
    const suggestsMatch = s.instructions.match(/SUGGESTS:\s*(.+)/);
    const suggests = suggestsMatch ? ` Suggests: ${suggestsMatch[1].trim()}` : "";
    return `- SKILL "${s.name}" [${s.summary}]${suggests}`;
  }).join("\n");

  const activeSkillInstructions = pulledSkillInstructions.length > 0
    ? `\n\n--- ACTIVE SKILL INSTRUCTIONS ---\n${pulledSkillInstructions.join("\n\n---\n\n")}`
    : "";

  const autoAttachSkills = skills.filter(s => s.auto_attach);
  const autoAttachInstructions = autoAttachSkills.map(s =>
    `--- SKILL: ${s.name} ---\n${s.instructions}`
  ).join("\n\n");

  // Token budget monitoring
  const autoAttachChars = autoAttachSkills.reduce((sum, s) => sum + s.instructions.length, 0);
  if (autoAttachChars > 4800) {
    console.warn(`[gemini-agent] Auto-attach skill chars: ${autoAttachChars} (exceeds 4800 budget, ~${Math.round(autoAttachChars / 4)} tokens)`);
  }

  const prompt = `${contextPrompt}

${autoAttachInstructions ? `\n--- AUTO-ATTACHED SKILLS ---\n${autoAttachInstructions}` : ""}
${activeSkillInstructions}

--- AVAILABLE SKILLS ---
${skillMap || "No skills defined."}

---
CASE SIGNALS:
${signalsText}
${existingEntitiesText}
${entityDossiers ? `\nENTITY DOSSIERS:\n${entityDossiers}` : ""}
${tasksText}

${previousSummary ? `PREVIOUS ANALYSIS:\n${previousSummary}\n` : ""}
OTHER OPEN CASES (check for MERGE — if same topic/sender, use merge_into with the case ID):
${casesText}

---
INSTRUCTIONS:
Return JSON with:

1. "decision": "standalone" or "merge"

2. "commands": array of:
   - {"type": "set_status", "value": "open|action_needed|in_progress|addressed|scheduled|escalated"}
   - {"type": "set_urgency", "value": 1-5} — 1=CRITICAL (needs attention NOW), 2=HIGH, 3=MEDIUM, 4=LOW, 5=MINIMAL
   - {"type": "set_importance", "value": 1-5} — 1=CRITICAL (highest impact), 2=HIGH, 3=MEDIUM, 4=LOW, 5=MINIMAL
   - {"type": "set_title", "value": "short title"}
   - {"type": "set_next_scan", "value": "ISO8601 datetime"} — OPTIONAL override of default scan schedule
   - {"type": "set_empowerment_line", "value": "short empowering message about owner's management, max 100 chars"}
   - {"type": "set_summary", "value": "1-2 sentences"}
   - {"type": "create_entity", "name": "name", "entity_type": "person|company|project|invoice|other", "role": "primary|related|mentioned", "phone": "optional", "email": "optional", "whatsapp_number": "optional", "telegram_handle": "optional"}
   - {"type": "attach_entity", "name": "existing entity name", "role": "primary|related|mentioned"} — link an existing entity to this case (no creation)
   - {"type": "merge_into", "target_case_id": "UUID", "reason": "why"}
   - {"type": "pull_skill", "skill_name": "exact skill name"}
   - {"type": "create_task", "title": "task title", "description": "optional detail", "scheduled_at": "ISO8601 or omit", "due_at": "ISO8601 or omit"}
   - {"type": "close_task", "task_id": "UUID"} — close a completed task
   - {"type": "update_task", "task_id": "UUID", "title": "new title", "scheduled_at": "ISO8601", "due_at": "ISO8601"}

3. "reasoning": brief explanation

IMPORTANT SCALE: 1 = most critical/urgent, 5 = least. Lower number = higher priority.
The system has a default scan schedule based on urgency×importance (e.g. 1×1=5min, 3×3=1h, 5×5=24h).

HOWEVER: you can OVERRIDE the default schedule with set_next_scan when it makes sense.
Examples of when to override:
- Case is "addressed" but important → defer to tomorrow
- Waiting for a meeting on Tuesday → set scan to Monday night
- Nothing will change for a week → defer 7 days
- Something urgent but you already classified it → no need to re-scan in 20s, set to 1 hour

If you don't include set_next_scan, the system uses the default matrix.

For standalone: ALWAYS include set_status, set_urgency, set_importance, set_title, set_summary, AND set_empowerment_line. Optionally set_next_scan.
EMPOWERMENT LINE IS MANDATORY: Every scan MUST include set_empowerment_line — a short (max 100 chars) positive, empowering message about how well the owner is managing things. Make it personal and specific to the case. Hebrew is fine.
For merge: only merge_into.
ENTITIES — MANDATORY on every scan:
- Extract ALL people, companies, and projects mentioned in signals.
- For each person: include "phone" (if visible in signal), "whatsapp_number", "telegram_handle" if known.
- Do NOT re-create entities that are already connected (listed above).
- Use create_entity with: name, entity_type (person/company/project/other), role (primary/related/mentioned), and contact fields.
- A "primary" entity is the main person/company the case is ABOUT.
- A "related" entity is someone involved but not the main subject.
- Even if you see just a name — create the entity. Contact info can be added later.

TASKS — Review open tasks:
- If a task is done based on signals → close it with close_task.
- If new follow-ups are needed → create_task with clear title and date.
- Be specific: "Call back Ronen about invoice" not "Follow up".

SKILLS — If available, follow skill instructions. Auto-attached skills are already in context.

Return ONLY valid JSON.`;

  const startTime = Date.now();
  const result = await model.generateContent(prompt);
  const durationMs = Date.now() - startTime;
  const raw = result.response.text();
  const tokens = result.response.usageMetadata?.totalTokenCount || 0;

  const response: AgentResponse = JSON.parse(raw);

  // Check if any pull_skill commands
  const skillPulls = response.commands.filter(c => c.type === "pull_skill") as Array<{ type: "pull_skill"; skill_name: string }>;
  const pulledNames = skillPulls.map(s => s.skill_name);

  return { response, raw, tokens, durationMs, skillsPulled: pulledNames };
}
