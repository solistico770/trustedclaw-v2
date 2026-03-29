import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export type AgentCommand =
  | { type: "set_status"; value: string }
  | { type: "set_urgency"; value: string }
  | { type: "set_importance"; value: number }
  | { type: "set_title"; value: string }
  | { type: "set_summary"; value: string }
  | { type: "set_next_scan"; value: string }
  | { type: "propose_entity"; name: string; entity_type: string; role: string }
  | { type: "merge_into"; target_case_id: string; reason: string }
  | { type: "pull_skill"; skill_name: string };

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

export async function callAgent(
  contextPrompt: string,
  messages: Array<{ sender: string; content: string; timestamp: string }>,
  openCases: Array<{ id: string; title: string; summary: string; importance: number; message_count: number }>,
  skills: Skill[],
  pulledSkillInstructions: string[],
  previousSummary?: string
): Promise<{ response: AgentResponse; raw: string; tokens: number; durationMs: number; skillsPulled: string[] }> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" },
  });

  const messagesText = messages.map((m, i) => `[${i + 1}] ${m.timestamp} | ${m.sender}: ${m.content}`).join("\n");
  const casesText = openCases.length > 0
    ? openCases.map(c => `- Case ${c.id.slice(0, 8)}: "${c.title}" (importance=${c.importance}, ${c.message_count} msgs)`).join("\n")
    : "No other open cases.";

  // Build skill map — summary for all, full instructions for auto_attach and pulled
  const skillMap = skills.filter(s => s.auto_attach || s.summary).map(s =>
    `- SKILL "${s.name}": ${s.summary}${s.auto_attach ? " [AUTO-ATTACHED]" : " [PULL with pull_skill command if needed]"}`
  ).join("\n");

  const activeSkillInstructions = pulledSkillInstructions.length > 0
    ? `\n\n--- ACTIVE SKILL INSTRUCTIONS ---\n${pulledSkillInstructions.join("\n\n---\n\n")}`
    : "";

  const autoAttachInstructions = skills.filter(s => s.auto_attach).map(s =>
    `--- SKILL: ${s.name} ---\n${s.instructions}`
  ).join("\n\n");

  const prompt = `${contextPrompt}

${autoAttachInstructions ? `\n--- AUTO-ATTACHED SKILLS ---\n${autoAttachInstructions}` : ""}
${activeSkillInstructions}

--- AVAILABLE SKILLS ---
${skillMap || "No skills defined."}

---
CASE MESSAGES:
${messagesText}

${previousSummary ? `PREVIOUS ANALYSIS:\n${previousSummary}\n` : ""}
OTHER OPEN CASES:
${casesText}

---
INSTRUCTIONS:
Return JSON with:

1. "decision": "standalone" or "merge"

2. "commands": array of:
   - {"type": "set_status", "value": "open|action_needed|in_progress|addressed|scheduled|escalated"}
   - {"type": "set_urgency", "value": "immediate|soon|normal|low"}
   - {"type": "set_importance", "value": 1-10}
   - {"type": "set_title", "value": "short title"}
   - {"type": "set_summary", "value": "1-2 sentences"}
   - {"type": "set_next_scan", "value": "ISO8601 datetime"}
   - {"type": "propose_entity", "name": "name", "entity_type": "person|company|project|invoice|other", "role": "primary|related|mentioned"}
   - {"type": "merge_into", "target_case_id": "UUID", "reason": "why"}
   - {"type": "pull_skill", "skill_name": "exact skill name"} — use this to request full instructions for a skill you need

3. "reasoning": brief explanation

For standalone: always include set_status, set_urgency, set_importance, set_title, set_summary, set_next_scan.
For merge: only merge_into.
Only propose entities that are REAL things (people, companies, projects). Don't re-propose entities already connected.
Use pull_skill when you need specific instructions for handling a situation.

Return ONLY valid JSON.`;

  const startTime = Date.now();
  const result = await model.generateContent(prompt);
  const durationMs = Date.now() - startTime;
  const raw = result.response.text();
  const tokens = result.response.usageMetadata?.totalTokenCount || 0;

  const response: AgentResponse = JSON.parse(raw);

  // Check if any pull_skill commands — need second pass
  const skillPulls = response.commands.filter(c => c.type === "pull_skill") as Array<{ type: "pull_skill"; skill_name: string }>;
  const pulledNames = skillPulls.map(s => s.skill_name);

  return { response, raw, tokens, durationMs, skillsPulled: pulledNames };
}
