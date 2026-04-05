/**
 * Create/replace all skills for TrustedClaw agent
 * 10 decomposed skills: 2 auto-attach, 8 pull-on-demand
 *
 * v2 — Life-aware intelligence: personal vs business classification,
 *       contextual significance, conversation understanding
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
  // ─── AUTO-ATTACH SKILLS (always in prompt) ─────────────────────────────────

  {
    name: "signal-triage",
    summary: "Core triage: classify personal vs business, decide significance, route signals. Always active.",
    auto_attach: true,
    instructions: `SIGNAL TRIAGE SKILL

You read someone's REAL LIFE. Understand context before deciding.

CLASSIFY FIRST — PERSONAL vs BUSINESS:
Personal: friends, family, social plans, memes, banter, errands, group chat noise
Business: money, clients, suppliers, work tasks, projects, deadlines, deals
Mixed (friend+client, family in business): treat as business

DECIDE:
CREATE CASE: business conversations worth tracking | personal ONLY if significant (health, money, commitment, conflict, someone asks owner to DO something)
ASSIGN: same person + same topic as open case (check KNOWN ENTITIES) | continuation/follow-up
IGNORE: memes, jokes, stickers, "good morning" blasts, group banter (football, reactions, "+1", "lol"), forwarded news, bot/system msgs, spam, empty forwards

DON'T OVER-CREATE:
- Friends group chatting about weekend plans owner isn't in → IGNORE
- Friend says "can you help me move Saturday?" → CREATE (commitment)
- 10 msgs about football → IGNORE | someone shares job lead for owner → CREATE

THREADING: same sender + topic within 30 min → ONE case (group_key). Groups: by TOPIC not sender.

ENTITIES: extract wa_jid from sender_identifier, name, type, role, phone. Check KNOWN ENTITIES before creating duplicates.`,
  },

  {
    name: "case-management",
    summary: "Case lifecycle: status, urgency, importance with life-aware classification. Always active.",
    auto_attach: true,
    instructions: `CASE MANAGEMENT SKILL

MUST set on every scan: status, urgency, importance, title, summary, empowerment_line.
Read ALL signals. Understand the STORY — what happened, what's at stake, for whom.

STATUS: open | action_needed (owner must act) | in_progress | addressed | scheduled | escalated (money/relationship at risk) | closed

IMPORTANCE — what's at stake:
1=Life-changing (>10K money, legal, health emergency, key relationship)
2=Significant (real money, important client, reputation)
3=Normal (routine work/life, standard requests)
4=Low (nice-to-have, informational) 5=Trivial

URGENCY — when:
1=NOW (someone waiting, deadline today, emergency) 2=Today 3=This week 4=Whenever 5=Background

EXAMPLES (personal vs business matters):
- Mom in hospital → urg1/imp1 | Friend help moving → urg3/imp3
- Client invoice request → urg2/imp2 | Supplier confirms delivery → urg4/imp3
- Birthday planning → urg4/imp4

TITLE: descriptive, include person's name, signal language. "רוני — חשבונית פרויקט" not "New request"
SUMMARY: what happened + what action needed. 1-2 sentences, specific.
EMPOWERMENT: max 100 chars, personal, specific, Hebrew great. Not generic "keep it up".

ENTITIES: extract ALL people/companies/projects. Don't re-create connected ones. Include wa_jid, phone.
Pull memory-importance for complex classification. Pull task-management for follow-ups.`,
  },

  // ─── PULL-ON-DEMAND SKILLS ─────────────────────────────────────────────────

  {
    name: "entity-create",
    summary: "PULL when creating new entities. Entity creation, fields, dedup by wa_jid/phone/name.",
    auto_attach: false,
    instructions: `ENTITY CREATE SKILL

ENTITY FIELDS:
- canonical_name: Full name as it appears (Hebrew fine)
- entity_type: must match entity_type slug (person, company, project, etc.)
- role: primary | related | mentioned
- phone: Israeli format 972XXXXXXXXX
- wa_jid: WhatsApp JID from sender_identifier (e.g. "972501234567@c.us" or LID format). ALWAYS include for WA signals — critical for auto-resolve.
- tg_user_id: Telegram user ID. Include for TG signals.
- email: if visible in signal
- aliases: alternative names/spellings

DEDUPLICATION ORDER:
1. Check by wa_jid first (strongest — same JID = same person, always)
2. Check by phone number
3. Check by canonical_name (case-insensitive)
4. Check aliases
If found → link existing entity, don't create duplicate

CREATION RULES:
- Even just a name → create entity. Contact info can be added later.
- One case should have 1-2 primary entities
- Additional entities are "related" or "mentioned"
- An entity can be linked to MULTIPLE cases
- When merging cases, merge entity links too

EXTRACT wa_jid FROM SIGNALS:
- sender_identifier "972501234567@c.us" → wa_jid = "972501234567@c.us"
- sender_identifier "33436521762932@lid" → wa_jid = "33436521762932@lid"
- Both @c.us and @lid formats are stable identifiers

SUGGESTS: entity-recall`,
  },

  {
    name: "entity-recall",
    summary: "PULL when known entities appear in signals (dossiers in KNOWN ENTITIES section). Interpret history for assign/create decisions.",
    auto_attach: false,
    instructions: `ENTITY RECALL SKILL

When the prompt includes KNOWN ENTITIES or ENTITY DOSSIERS, use this skill to interpret them.

READING A DOSSIER:
- "Open Cases: N" → check if any match current topic before creating new case
- "Recent Signals (last 7d): N messages" → high-activity entity, important contact
- "Last Contact: Xh ago" → recent contact suggests ongoing conversation
- "Related Entities" → understand relationship network

DECISION FRAMEWORK:
- Entity has open case on SAME topic → ASSIGN signal to that case
- Entity has open case on DIFFERENT topic → CREATE new case but link same entity
- Entity has 5+ open cases → consider merging related ones
- Entity has no open cases → CREATE new case
- Entity last contacted >30 days ago + new message → likely new topic, CREATE case

CROSS-CASE AWARENESS:
- Look at entity's full case portfolio, not just current case
- Recurring patterns (monthly invoices, weekly check-ins) → note in metadata
- Multiple cases about same person from different senders → may indicate urgency

SUGGESTS: entity-enrich`,
  },

  {
    name: "entity-enrich",
    summary: "PULL when signals contain contact info, addresses, company names, or relationships to extract.",
    auto_attach: false,
    instructions: `ENTITY ENRICH SKILL

Extract and store structured data from signal content.

ALWAYS EXTRACT:
- wa_jid: from sender_identifier (CRITICAL for auto-resolve)
- tg_user_id: from TG signal metadata
- Phone numbers (Israeli: 972XXXXXXXXX, international: country code + number)
- Email addresses
- Physical addresses
- Company/organization affiliation
- Role/title/position

METADATA STRUCTURE (entity.metadata JSONB):
{
  "company": "חברה בע״מ",
  "title": "מנכ״ל",
  "address": "רחוב הרצל 10, תל אביב",
  "notes": "Facts only, no opinions",
  "relationships": [
    { "entity_name": "שם", "type": "partner|employee|client|supplier|friend|family" }
  ]
}

EXTRACTION RULES:
- "call me at 054-1234567" → update phone to 972541234567
- "I work at X" → update company
- "דני עובד אצל חיים" → relationship: employee
- "הספק שלנו, חברת ABC" → relationship: supplier
- Group chat names often contain business context
- Update existing data, don't overwrite with empty
- Keep notes concise — facts only`,
  },

  {
    name: "entity-group-create",
    summary: "PULL when encountering entities that don't fit existing types (person, company, project, etc.).",
    auto_attach: false,
    instructions: `ENTITY GROUP CREATE SKILL

Entity groups (entity_types) define CATEGORIES of entities.

DEFAULT GROUPS: person, company, project, invoice, bank_account, contract, product, bot, other

WHEN TO CREATE A NEW GROUP:
- Entities that don't fit existing groups
- Owner discusses a new category (e.g. "properties", "vehicles", "suppliers")
- When context instructions are needed for a specific type

GROUP FIELDS:
- slug: lowercase-kebab-case (e.g. "real-estate", "supplier")
- display_name: Human-readable (Hebrew OK, e.g. "נכסים")
- icon: emoji (e.g. "🏠")
- color: hex color (e.g. "#4CAF50")
- context: AI instructions for handling this type (POWERFUL — add extraction rules)

CONTEXT FIELD EXAMPLES:
- "always extract address and price for real-estate entities"
- "always link supplier entities to invoice cases"
- "for vehicle entities, extract license plate and model"

RULES:
- Don't create duplicate groups — check existing entity_types first
- Use meaningful self-explanatory slugs
- Default groups should not be recreated`,
  },

  {
    name: "conversation-threading",
    summary: "PULL when multiple signals from same sender or same group appear in the batch. Advanced multi-message grouping.",
    auto_attach: false,
    instructions: `CONVERSATION THREADING SKILL

Advanced grouping for multi-message conversations.

TIME-BASED GROUPING:
- Multiple messages from same sender within 30 minutes = ONE conversation
- Use group_key to batch conversation messages into one case
- Messages separated by >2 hours likely = different conversations

TOPIC DETECTION:
- If messages shift topic, split into separate group_keys
- Example: 3 messages about "invoice" then 2 about "meeting" = 2 group_keys
- Key topic signals: money amounts, dates, names, action words
- Same topic words/names across messages = same group_key

GROUP CHAT RULES:
- Group by TOPIC, not by sender
- Multiple senders discussing same thing = one case
- Side conversations in group = separate cases
- "@mention owner" in group = higher urgency
- Social banter (jokes, memes, reactions) with no substance → IGNORE all of them, don't create a case

CONTINUATION vs NEW:
- Sender has open case on same topic → ASSIGN, don't create
- Sender has open case on DIFFERENT topic → new group_key
- "follow up on..." or "regarding..." = continuation
- New topic words with no relation to open cases = new case

VOICE MESSAGES:
- Treat as text (content has transcription or "[voice message]")
- Still group with text messages from same conversation

EDGE CASES:
- Single-word replies ("ok", "תודה", "👍") → assign to most recent case from same sender
- Forwarded messages → treat as new topic unless context links to existing case`,
  },

  {
    name: "memory-importance",
    summary: "PULL when setting urgency/importance or deciding rescan timing. Life-aware classification framework.",
    auto_attach: false,
    instructions: `MEMORY IMPORTANCE SKILL

IMPORTANCE — UNDERSTAND WHAT'S REALLY AT STAKE:

Business signals:
- Large money (>10K NIS) or legal risk → importance 1
- Active deal, important client, deadline → importance 2
- Routine business (regular order, standard request) → importance 3
- Informational, FYI, no action needed → importance 4
- Noise tracked just in case → importance 5

Personal signals:
- Health emergency (self/family), serious family crisis → importance 1
- Important personal commitment, significant relationship moment → importance 2
- Normal personal errand, friend asking reasonable favor → importance 3
- Social plans, casual catch-up → importance 4
- Barely relevant, only tracked because someone asked → importance 5

URGENCY — WHEN DOES THE WORLD EXPECT A RESPONSE:
- Someone is actively waiting RIGHT NOW → urgency 1
- Expected response today (business hours, promised callback) → urgency 2
- This week, normal pace → urgency 3
- No one is waiting, do it when convenient → urgency 4
- Background, no response expected → urgency 5

CONTEXT CLUES FOR URGENCY:
- "?" at end of message → someone is waiting for answer (bump urgency)
- Multiple messages in a row from same person → they're waiting (bump urgency)
- "בבקשה תחזור אלי" / "please get back to me" → urgency 2 minimum
- "דחוף" / "urgent" / "ASAP" → urgency 1
- Voice message → usually more urgent than text (they bothered to record)

RESCAN INTELLIGENCE (use set_next_scan):
Think about WHEN the situation will change:
- "I'll send tomorrow" → rescan tomorrow morning
- "Meeting next Tuesday" → rescan Monday evening
- Case addressed, nothing pending → rescan in 3 days
- Waiting for someone's response → rescan in 6 hours
- Recurring pattern → rescan at next expected occurrence
- Personal low-stakes case → rescan in 2-7 days
- Urgent case just classified → rescan in 1-2 hours (not 5 min!)

WHAT TO TRACK:
- Names, phone numbers, dates, amounts — ALWAYS
- Promises ("I'll do X by Y") → create task with due_at
- Decisions made → note in case summary
- Recurring patterns → note in entity metadata

WHAT TO SKIP:
- Small talk, greetings without substance → no entities, no tasks
- Duplicate info already in case summary
- Trivial acks ("ok", "thanks") → assign to existing, don't create new`,
  },

  {
    name: "task-management",
    summary: "PULL when follow-up actions are identified. Task creation, closing, scheduling.",
    auto_attach: false,
    instructions: `TASK MANAGEMENT SKILL

WHEN TO CREATE TASKS:
- Explicit requests: "call me back", "send the document"
- Promises: "I'll do X by Y" → task with due_at
- Deadlines: "meeting on Tuesday" → task with scheduled_at
- Follow-ups: "check if payment arrived" → task with due_at
- Personal commitments: "help Dani move on Saturday" → task with scheduled_at

TASK FIELDS:
- title: Clear, actionable, specific. "Call back Ronen about invoice #123" not "Follow up"
- description: Optional longer details
- scheduled_at: When to do it (ISO8601)
- due_at: Deadline (ISO8601)

CLOSING TASKS:
- If signal says "done", "sent", "paid" → close relevant task with close_task
- Match by topic/entity, not just keywords
- Don't close tasks that are partially done

UPDATING TASKS:
- If deadline changes → update_task with new due_at
- If task scope changes → update_task with new title
- Don't create duplicate tasks — update existing ones

RULES:
- One task per action item, not one task per message
- Link tasks to the right case
- Be specific: include names, amounts, dates in task titles
- Hebrew task titles are fine
- Don't create tasks for vague intentions ("maybe we should...")
- Only create tasks for concrete, actionable commitments`,
  },

  {
    name: "merge-detection",
    summary: "PULL when signals overlap with existing cases or same entity appears across multiple cases.",
    auto_attach: false,
    instructions: `MERGE DETECTION SKILL

WHEN TO MERGE:
- Two cases about the SAME topic from the SAME person
- One case is a follow-up to another
- Duplicate cases created from batch triage
- Same entity is primary in two cases about same subject

HOW TO MERGE:
- Use merge_into command with target_case_id
- Keep the MORE IMPORTANT case (lower importance number)
- Keep the OLDER case if equal importance
- Merge moves: signals, tasks, entity links
- Merged case gets status "merged"

MERGE SIGNALS:
- Same entity + same topic keywords = likely merge candidate
- "Follow up on..." referencing existing case = merge
- Same phone number / wa_jid in primary entity = check for merge

DON'T MERGE:
- Same person, different topics (person can have multiple cases)
- Same topic, different people (unless clearly same conversation)
- Cases with different urgency levels unless truly duplicate

AFTER MERGE:
- Target case gets all signals, entities, tasks
- Target case triggers rescan
- Merged case is closed`,
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
    else console.log(`Created skill: ${s.name} (auto_attach: ${s.auto_attach})`);
  }

  // Verify
  const { data } = await db.from("skills").select("name, auto_attach, summary").eq("user_id", userId).order("auto_attach", { ascending: false });
  console.log(`\n${data?.length || 0} skills created:`);
  for (const s of data || []) {
    console.log(`  ${s.auto_attach ? "AUTO" : "PULL"} | ${s.name}: ${s.summary?.slice(0, 60)}`);
  }

  // Token budget check
  const autoSkills = (data || []).filter(s => s.auto_attach);
  console.log(`\nAuto-attach skills: ${autoSkills.length}`);
  console.log(`Pull-on-demand skills: ${(data?.length || 0) - autoSkills.length}`);

  const { data: fullAuto } = await db.from("skills").select("instructions").eq("user_id", userId).eq("auto_attach", true);
  const totalChars = (fullAuto || []).reduce((sum, s) => sum + (s.instructions?.length || 0), 0);
  const estTokens = Math.round(totalChars / 4);
  console.log(`Auto-attach instruction chars: ${totalChars} (~${estTokens} tokens)`);
  if (totalChars > 4800) {
    console.warn(`⚠ WARNING: Auto-attach exceeds 4800 char budget (${totalChars})`);
  } else {
    console.log(`✓ Within 4800 char budget`);
  }
}

main().catch(console.error);
