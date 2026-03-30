/**
 * Create/replace all skills for TrustedClaw agent
 */
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const userId = "c1a3c911-34de-48d0-8d23-ab53d8a8d0b4";

const skills = [
  {
    name: "signal-triage",
    summary: "How to decide if a signal becomes a case, gets assigned, or ignored",
    auto_attach: true,
    instructions: `SIGNAL TRIAGE SKILL

A signal is a WhatsApp/Telegram message from a real person or group.

WHEN TO CREATE A CASE:
- Any request, question, or task from someone
- Any business discussion (payments, deliveries, meetings, projects)
- Any update that needs follow-up
- Any complaint or problem report
- Multiple messages from same person about same topic = ONE case (use group_key)
- Messages from the owner (ME=) about business topics

WHEN TO ASSIGN TO EXISTING CASE:
- Same person + same topic as an existing case
- Follow-up to an ongoing conversation
- Reply in a thread that already has a case

WHEN TO IGNORE (very few signals should be ignored):
- Pure emoji/sticker with no text
- Automated bot notifications
- Spam/marketing messages from unknown numbers
- Empty forwards with no caption
- System messages (X joined the group, etc.)

NEVER ignore:
- Messages from known contacts even if short
- Voice messages (mark as voice message, still create case)
- Messages with phone numbers, dates, amounts
- Group messages where the owner is mentioned

GROUPING: Use group_key to group related signals into one case.
Same sender + same topic = same group_key.`,
  },
  {
    name: "entity-management",
    summary: "How to create and manage entities (people, companies) with contact info",
    auto_attach: true,
    instructions: `ENTITY MANAGEMENT SKILL

Every case involves real people and organizations. Extract them.

ALWAYS CREATE ENTITIES FOR:
- People who send messages (name from WA contact)
- People mentioned by name in messages
- Companies/businesses mentioned
- Projects or deals discussed

ENTITY FIELDS:
- name: Full name as it appears (Hebrew is fine)
- entity_type: person | company | project | other
- role: primary (main person case is about) | related (involved) | mentioned (just referenced)
- phone: Israeli format 972XXXXXXXXX if visible in signal
- whatsapp_number: same as phone for WA contacts
- telegram_handle: @username if from Telegram

RULES:
- One case should have 1-2 primary entities (the main people involved)
- Don't create duplicate entities, check the ALREADY CONNECTED list
- If you see a phone number in the message text, add it to the entity
- If sender identifier has a phone number (like +972501234567), use it
- Company names are entity_type=company
- Person names are entity_type=person`,
  },
  {
    name: "case-management",
    summary: "How to set case status, urgency, importance, and manage lifecycle",
    auto_attach: true,
    instructions: `CASE MANAGEMENT SKILL

Every case scan MUST set: status, urgency, importance, title, summary, empowerment_line.

STATUS VALUES:
- open: New case, needs attention
- action_needed: Owner must take specific action (call back, send document, etc.)
- in_progress: Being worked on actively
- addressed: Owner handled it, monitoring
- scheduled: Action planned for a specific date
- escalated: Critical, needs immediate attention
- closed: Done, no more action needed

URGENCY (how soon):
1 = NOW, drop everything, handle this
2 = Today, handle within hours
3 = This week, normal priority
4 = When possible, no rush
5 = Whenever, background/routine

IMPORTANCE (business impact):
1 = Critical, major money, legal, or relationship at stake
2 = High, significant business value
3 = Medium, normal business operation
4 = Low, nice to have
5 = Minimal, trivial

TITLE: Short, clear, in the language of the signals. Not generic.
SUMMARY: 1-2 sentences explaining what happened and what action is needed.
EMPOWERMENT LINE: Short motivating message to the owner. Hebrew is great. Be specific to the case.

MERGE: If two cases are about the same topic/person, merge the less important one into the more important one.`,
  },
];

async function main() {
  // Delete existing skills
  const { error: delErr } = await db.from("skills").delete().eq("user_id", userId);
  if (delErr) console.error("Delete error:", delErr.message);
  else console.log("Cleared old skills");

  for (const s of skills) {
    const { error } = await db.from("skills").insert({ user_id: userId, ...s, is_active: true });
    if (error) console.log("Error inserting", s.name, ":", error.message);
    else console.log("Created skill:", s.name);
  }

  // Verify
  const { data } = await db.from("skills").select("name, auto_attach").eq("user_id", userId);
  console.log("\nSkills:", data);
}

main().catch(console.error);
