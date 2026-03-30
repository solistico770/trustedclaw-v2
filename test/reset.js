/**
 * reset.js — Wipe all data and re-seed gates + skills + settings.
 * Usage: node test/reset.js
 */
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function main() {
  const { data: profiles } = await db.from("profiles").select("id, role");
  if (!profiles?.length) { console.error("No users found. Sign up first."); return; }
  const userId = profiles[0].id;
  console.log("User:", userId, "role:", profiles[0].role);

  // ── WIPE ALL DATA (order matters for FK constraints) ──
  console.log("\n--- Wiping all data ---");
  await db.from("audit_logs").delete().eq("user_id", userId);
  await db.from("case_events").delete().eq("user_id", userId);
  await db.from("scan_logs").delete().eq("user_id", userId);
  await db.from("tasks").delete().eq("user_id", userId);
  await db.from("case_entities").delete().neq("id", "00000000-0000-0000-0000-000000000000"); // delete all
  await db.from("signals").delete().eq("user_id", userId);
  await db.from("cases").delete().eq("user_id", userId);
  await db.from("entities").delete().eq("user_id", userId);
  await db.from("skills").delete().eq("user_id", userId);
  await db.from("gates").delete().eq("user_id", userId);
  await db.from("user_settings").delete().eq("user_id", userId);
  console.log("All data wiped.");

  // ── SETTINGS ──
  await db.from("user_settings").upsert({
    user_id: userId,
    context_prompt: [
      "You are an operational agent for a busy B2B sales representative.",
      "Your job: triage incoming signals, classify by urgency and importance, extract entities, create tasks, and provide actionable Hebrew summaries.",
      "Language: Hebrew preferred for titles/summaries. English OK for names and technical terms.",
      "Scale: 1 = most critical, 5 = routine.",
      "This person manages customers, orders, a boss, and personal life. Prioritize business over personal unless urgent.",
    ].join("\n"),
  }, { onConflict: "user_id" });
  console.log("Settings created.");

  // ── GATES ──
  const gates = [
    { user_id: userId, type: "whatsapp", display_name: "WhatsApp Business", status: "active", metadata: { is_admin_gate: true, description: "Admin WhatsApp - messages FROM the sales rep" } },
    { user_id: userId, type: "email", display_name: "Work Email", status: "active", metadata: { description: "Corporate email inbox" } },
    { user_id: userId, type: "telegram", display_name: "Telegram", status: "active", metadata: { description: "Personal Telegram" } },
    { user_id: userId, type: "phone", display_name: "Phone Calls", status: "active", metadata: { description: "Phone call summaries" } },
    { user_id: userId, type: "slack", display_name: "Company Slack", status: "active", metadata: { description: "Internal company Slack" } },
    { user_id: userId, type: "simulator", display_name: "Simulator", status: "active", metadata: { description: "Test simulator" } },
  ];
  const { data: gateData } = await db.from("gates").insert(gates).select("id, type, display_name");
  console.log("Gates:", gateData.map(g => g.display_name).join(", "));

  // ── SKILLS ──
  const skills = [
    {
      user_id: userId, name: "First Contact", auto_attach: true, is_active: true,
      summary: "Handles first scan of a new case. MUST set title and summary.",
      instructions: [
        "FIRST CONTACT - runs on every new case.",
        "YOU MUST: set_title (Hebrew, max 60 chars), set_summary (Hebrew, 1-2 sentences), set_urgency (1-5), set_importance (1-5), set_status ('open').",
        "If there's only one signal, base title on its content.",
        "If signals are in Hebrew, write title+summary in Hebrew.",
      ].join("\n"),
    },
    {
      user_id: userId, name: "Entity Attachment", auto_attach: true, is_active: true,
      summary: "Extracts entities (people, companies, projects, orders) from signals.",
      instructions: [
        "ENTITY ATTACHMENT - identify real-world entities.",
        "propose_entity for REAL things: people (person), companies (company), projects (project), invoices (invoice).",
        "Do NOT propose generic words. Do NOT re-propose already connected entities.",
        "Normalize names. Max 3 per scan. Role: primary/related/mentioned.",
      ].join("\n"),
    },
    {
      user_id: userId, name: "Urgency & Importance", auto_attach: true, is_active: true,
      summary: "Evaluates urgency (1=NOW, 5=whenever) and importance (1=critical, 5=minimal).",
      instructions: [
        "URGENCY: 1=NOW, 2=Today, 3=This week, 4=Can wait, 5=Whenever.",
        "IMPORTANCE: 1=Critical (major client/legal/financial), 2=High, 3=Medium, 4=Low, 5=Minimal.",
        "DE-ESCALATE on positive signals. ESCALATE on deadlines/financial risk/follow-ups.",
      ].join("\n"),
    },
    {
      user_id: userId, name: "Task Management", auto_attach: true, is_active: true,
      summary: "Creates, closes, and manages tasks. Runs every scan.",
      instructions: [
        "TASK MANAGEMENT - manage actionable tasks.",
        "CREATE tasks when signals imply specific actions (call, send, follow up, prepare).",
        "Set due_at for real deadlines. Set scheduled_at for scheduled actions.",
        "CLOSE tasks when evidence shows completion. Max 3 new tasks per scan.",
        "Hebrew titles. Don't duplicate existing open tasks.",
      ].join("\n"),
    },
    {
      user_id: userId, name: "Case Merge", auto_attach: true, is_active: true,
      summary: "Detects duplicate/related cases and merges them.",
      instructions: [
        "MERGE when: same sender + same topic, follow-up to existing conversation, same entity + subject.",
        "DO NOT merge: same sender different topics, similar topic different parties.",
        "merge_into the case with more history.",
      ].join("\n"),
    },
    {
      user_id: userId, name: "Scan Scheduling", auto_attach: true, is_active: true,
      summary: "Decides when to schedule the next scan.",
      instructions: [
        "Override default matrix with set_next_scan only when needed:",
        "Addressed+stable → 24h. Waiting for date → day before. Nothing changing → 7d.",
      ].join("\n"),
    },
  ];

  const { data: skillData, error } = await db.from("skills").insert(skills).select("name, auto_attach");
  if (error) { console.error("Skills error:", error.message); return; }
  console.log("Skills:", skillData.length, "created");
  skillData.forEach(s => console.log(" ", s.auto_attach ? "[AUTO]" : "[PULL]", s.name));

  // ── ADMIN ENTITY ──
  const { data: adminEntity } = await db.from("entities").insert({
    user_id: userId, type: "person", canonical_name: "Sales Rep (Admin)", status: "active",
  }).select("id").single();
  if (adminEntity) {
    await db.from("user_settings").update({ admin_entity_id: adminEntity.id }).eq("user_id", userId);
    console.log("Admin entity:", adminEntity.id.slice(0, 8));
  }

  // Return gate map for heartbeat use
  const gateMap = {};
  for (const g of gateData) gateMap[g.type] = g.id;

  console.log("\n=== RESET COMPLETE ===");
  console.log("Gate IDs:", JSON.stringify(gateMap, null, 2));
  console.log("\nNow run: node test/runBeat.js test/heartbeat-sales-rep.json");
}

main().catch(console.error);
