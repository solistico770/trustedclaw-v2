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
    name: "create-entity-group",
    summary: "How to create and manage entity groups/types (categories of entities like person, company, project)",
    auto_attach: true,
    instructions: `CREATE ENTITY GROUP SKILL

Entity groups (entity_types) define CATEGORIES of entities. Each group has a slug, display name, icon, color, and optional context instructions.

DEFAULT GROUPS: person, company, project, invoice, bank_account, contract, product, bot, other

WHEN TO CREATE A NEW GROUP:
- When you encounter entities that don't fit existing groups
- When the owner discusses a new category (e.g. "properties", "vehicles", "suppliers")
- When context instructions are needed for how to handle a specific type

GROUP FIELDS:
- slug: lowercase-kebab-case identifier (e.g. "real-estate", "supplier")
- display_name: Human-readable name (Hebrew OK, e.g. "נכסים", "ספקים")
- icon: emoji to represent the group (e.g. "🏠", "🏢")
- color: hex color for UI (e.g. "#4CAF50")
- context: Instructions to the AI about how to handle entities in this group

CONTEXT FIELD IS POWERFUL:
- Add rules like "always extract address and price for real-estate entities"
- Add rules like "always link supplier entities to invoice cases"
- Add domain-specific knowledge about what data to collect

RULES:
- Don't create duplicate groups — check existing entity_types first
- Use meaningful slugs that are self-explanatory
- Default groups (person, company, project) should not be recreated`,
  },
  {
    name: "entity",
    summary: "How to create, identify, and link entities (people, companies, projects) to cases",
    auto_attach: true,
    instructions: `ENTITY SKILL

Every case involves real people and organizations. You MUST extract and link them.

ALWAYS CREATE ENTITIES FOR:
- People who send messages (name from WA contact)
- People mentioned by name in messages
- Companies/businesses mentioned
- Projects or deals discussed

ENTITY FIELDS:
- canonical_name: Full name as it appears (Hebrew is fine, e.g. "חיים כהן")
- type: must match an entity_type slug (person, company, project, etc.)
- role: primary (main person case is about) | related (involved) | mentioned (just referenced)
- phone: Israeli format 972XXXXXXXXX if visible in signal
- aliases: alternative names/spellings (e.g. ["חיימי", "Chaim"])
- status: proposed → active (after confirmation) → archived

IDENTIFICATION RULES:
- Check ALREADY CONNECTED entities before creating new ones
- Same phone number = same entity (even if name differs)
- Similar Hebrew names may be the same person — check aliases
- If sender identifier has a phone number (like +972501234567), use it
- WA IDs ending in @c.us often contain phone numbers — extract them

LINKING TO CASES:
- One case should have 1-2 primary entities
- Additional entities are "related" or "mentioned"
- An entity can be linked to MULTIPLE cases
- When merging cases, merge entity links too

DEDUPLICATION:
- Before creating, search by phone number first
- Then search by canonical_name (case-insensitive)
- Then search aliases
- If found, link existing entity instead of creating new`,
  },
  {
    name: "entity-data",
    summary: "How to enrich entity metadata — phone, address, notes, relationships, and domain-specific data",
    auto_attach: true,
    instructions: `ENTITY DATA SKILL

Entities have a metadata JSONB field for storing rich, structured data beyond the basic fields.

ALWAYS EXTRACT AND STORE:
- Phone numbers (Israeli: 972XXXXXXXXX, international: country code + number)
- WhatsApp number (usually same as phone)
- Telegram handle (@username)
- Email addresses
- Physical addresses
- Company/organization affiliation
- Role/title/position

METADATA STRUCTURE (stored in entity.metadata JSONB):
{
  "phone": "972501234567",
  "whatsapp": "972501234567",
  "telegram": "@username",
  "email": "name@example.com",
  "address": "רחוב הרצל 10, תל אביב",
  "company": "חברה בע״מ",
  "title": "מנכ״ל",
  "notes": "Free text notes about this entity",
  "relationships": [
    { "entity_name": "שם", "type": "partner" | "employee" | "client" | "supplier" }
  ],
  "custom": {} // domain-specific fields per entity_type context
}

ENRICHMENT RULES:
- Extract data from signal content, not just sender info
- If someone mentions "call me at 054-1234567" → update their phone
- If someone says "I work at X" → update company field
- Group chat names often contain useful context
- Media messages (documents, images) may have metadata with names/numbers
- Update existing data, don't overwrite with empty values
- Keep notes concise — facts only, no opinions

RELATIONSHIPS:
- Track connections between entities
- "דני עובד אצל חיים" → relationship: employee
- "הספק שלנו, חברת ABC" → relationship: supplier
- Relationships help the AI understand context in future cases`,
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
