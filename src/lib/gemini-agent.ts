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
  | { type: "merge_into"; target_case_id: string; reason: string };

export type AgentResponse = {
  decision: "standalone" | "merge";
  commands: AgentCommand[];
  reasoning: string;
};

export async function callAgent(
  contextPrompt: string,
  messages: Array<{ sender: string; content: string; timestamp: string }>,
  openCases: Array<{ id: string; title: string; summary: string; importance: number; message_count: number }>,
  previousSummary?: string
): Promise<{ response: AgentResponse; raw: string; tokens: number; durationMs: number }> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" },
  });

  const messagesText = messages.map((m, i) => `[${i + 1}] ${m.timestamp} | ${m.sender}: ${m.content}`).join("\n");
  const casesText = openCases.length > 0
    ? openCases.map(c => `- Case ${c.id.slice(0, 8)}: "${c.title}" (importance=${c.importance}, ${c.message_count} msgs)`).join("\n")
    : "No other open cases.";

  const prompt = `${contextPrompt}

---
CURRENT CASE MESSAGES:
${messagesText}

${previousSummary ? `PREVIOUS SCAN SUMMARY:\n${previousSummary}\n` : ""}
OTHER OPEN CASES (for merge consideration):
${casesText}

---
INSTRUCTIONS:
Analyze the messages above. Return a JSON object with:

1. "decision": "standalone" if this case is unique, or "merge" if it should be merged into one of the open cases listed above.

2. "commands": an array of command objects. Available commands:
   - {"type": "set_status", "value": "open|action_needed|in_progress|addressed|scheduled|escalated"}
   - {"type": "set_urgency", "value": "immediate|soon|normal|low"}
   - {"type": "set_importance", "value": 1-10}
   - {"type": "set_title", "value": "short title max 100 chars"}
   - {"type": "set_summary", "value": "1-2 sentence summary"}
   - {"type": "set_next_scan", "value": "ISO8601 datetime for next scan"}
   - {"type": "propose_entity", "name": "entity name", "entity_type": "person|company|project|invoice|bank_account|contract|product|bot|other", "role": "primary|related|mentioned"}
   - {"type": "merge_into", "target_case_id": "full UUID of target case", "reason": "why merging"}

3. "reasoning": brief explanation of your analysis (max 200 chars)

For standalone: include set_status, set_urgency, set_importance, set_title, set_summary, set_next_scan, and any propose_entity commands.
For merge: include only merge_into command.

Important:
- set_next_scan: urgent cases = 15 min from now. normal = hours. low importance = days.
- Always set a title and summary for standalone cases.
- Only propose entities that are real-world things (people, companies, projects), not generic words.

Return ONLY valid JSON. No markdown.`;

  const startTime = Date.now();
  const result = await model.generateContent(prompt);
  const durationMs = Date.now() - startTime;
  const raw = result.response.text();
  const tokens = result.response.usageMetadata?.totalTokenCount || 0;

  const response: AgentResponse = JSON.parse(raw);
  return { response, raw, tokens, durationMs };
}
