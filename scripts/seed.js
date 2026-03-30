const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function main() {
  const { data: profiles } = await db.from("profiles").select("id, role");
  if (!profiles?.length) { console.error("No users found"); return; }
  const userId = profiles[0].id;
  console.log("User:", userId, "role:", profiles[0].role);

  // Settings
  await db.from("user_settings").upsert({
    user_id: userId,
    context_prompt: [
      "You are an operational agent for a busy professional managing multiple communication channels.",
      "Your job: classify cases by urgency and importance, extract entities (people, companies, projects), decide merges, and provide actionable summaries.",
      "Language: Hebrew preferred for titles/summaries. English OK for technical terms.",
      "Scale: 1 = most critical, 5 = routine.",
    ].join("\n"),
  }, { onConflict: "user_id" });
  console.log("Settings created");

  // Gates
  const gates = [
    { user_id: userId, type: "whatsapp", display_name: "WhatsApp Personal", status: "active", metadata: { description: "Personal WhatsApp" } },
    { user_id: userId, type: "telegram", display_name: "Telegram", status: "active", metadata: { description: "Telegram messages" } },
    { user_id: userId, type: "email", display_name: "Email", status: "active", metadata: { description: "Email inbox" } },
    { user_id: userId, type: "simulator", display_name: "Simulator", status: "active", metadata: { description: "Test simulator" } },
  ];
  const { data: gateData } = await db.from("gates").insert(gates).select("id, display_name");
  console.log("Gates:", gateData.map(g => g.display_name).join(", "));

  // Skills
  const skills = [
    {
      user_id: userId, name: "First Contact", auto_attach: true, is_active: true,
      summary: "Handles first scan of a new case. MUST set title and summary.",
      instructions: [
        "FIRST CONTACT - runs on every new case.",
        "",
        "YOU MUST:",
        "1. set_title - short Hebrew title (max 60 chars) describing what this case is about",
        "2. set_summary - 1-2 sentence Hebrew summary of the situation",
        "3. set_urgency - 1-5 scale (1=critical NOW, 5=routine)",
        "4. set_importance - 1-5 scale (1=critical impact, 5=minimal)",
        "5. set_status - 'open' for new cases",
        "",
        "A case WITHOUT title+summary is USELESS. This is your #1 priority.",
        "If there's only one signal, base title on its content.",
        "If signals are in Hebrew, write title+summary in Hebrew.",
      ].join("\n"),
    },
    {
      user_id: userId, name: "Entity Attachment", auto_attach: true, is_active: true,
      summary: "Extracts and proposes entities (people, companies, projects) from signals.",
      instructions: [
        "ENTITY ATTACHMENT - identify real-world entities.",
        "",
        "Rules:",
        "- propose_entity for REAL things: people (person), companies (company), projects (project), invoices (invoice)",
        "- Do NOT propose generic words: dashboard, system, meeting, update, message",
        "- Do NOT re-propose entities already connected (check ALREADY CONNECTED list)",
        "- Normalize names: full name preferred over nickname",
        "- Max 3 entities per scan - only the most important ones",
        "- Role: primary for main subject, related for mentioned, mentioned for passing reference",
        "",
        "BLOCKLIST - never propose these as entities:",
        "dashboard, system, app, website, meeting, call, email, message, update, report, file, document, task, issue, bug, feature, request, ticket",
      ].join("\n"),
    },
    {
      user_id: userId, name: "Urgency & Importance", auto_attach: true, is_active: true,
      summary: "Evaluates urgency and importance. Handles de-escalation on positive signals.",
      instructions: [
        "URGENCY & IMPORTANCE - evaluate on every scan.",
        "",
        "Scale: 1 = most critical, 5 = routine.",
        "",
        "URGENCY (how soon?):",
        "1 - NOW (legal deadline today, system down)",
        "2 - Today (client waiting, time-sensitive)",
        "3 - This week (normal business)",
        "4 - Can wait (low priority)",
        "5 - Whenever (FYI, archive)",
        "",
        "IMPORTANCE (what impact?):",
        "1 - Critical (major client, legal, financial risk)",
        "2 - High (significant business)",
        "3 - Medium (normal)",
        "4 - Low (minor admin)",
        "5 - Minimal (noise)",
        "",
        "DE-ESCALATION - lower urgency+importance when:",
        "- paid/resolved/thanks signals",
        "- not urgent / whenever",
        "- No new signals >48h on non-critical case",
        "",
        "ESCALATION - raise urgency when:",
        "- Legal/court deadlines",
        "- urgent/ASAP/immediately",
        "- Multiple unanswered follow-ups",
        "- Financial amounts > 10,000 NIS",
      ].join("\n"),
    },
    {
      user_id: userId, name: "Scan Scheduling", auto_attach: true, is_active: true,
      summary: "Decides when to schedule the next scan based on case state.",
      instructions: [
        "SCAN SCHEDULING - decide next scan timing.",
        "",
        "Default: system uses urgency x importance matrix.",
        "Override with set_next_scan only when you have a good reason:",
        "- Case addressed and stable -> defer 24h",
        "- Waiting for specific date -> scan day before",
        "- Nothing will change for a week -> defer 7 days",
        "- Just escalated -> let matrix handle it",
      ].join("\n"),
    },
    {
      user_id: userId, name: "Case Merge", auto_attach: true, is_active: true,
      summary: "Detects duplicate/related cases and merges them. Runs every scan.",
      instructions: [
        "CASE MERGE - check OTHER OPEN CASES for duplicates.",
        "",
        "MERGE when:",
        "- Same sender + same topic",
        "- Follow-up to existing conversation",
        "- Same entity + same subject",
        "",
        "DO NOT merge when:",
        "- Same sender but different topics",
        "- Similar topic but different parties",
        "- One resolved, new one is new issue",
        "",
        "Use merge_into with target case ID. Merge INTO the case with more history.",
      ].join("\n"),
    },
    {
      user_id: userId, name: "Escalation & De-escalation", auto_attach: true, is_active: true,
      summary: "Evaluates escalation direction. Runs every scan.",
      instructions: [
        "ESCALATION & DE-ESCALATION - evaluate every scan.",
        "",
        "ESCALATE (action_needed/escalated):",
        "- Unresolved >3 days with urgency <= 2",
        "- Legal/financial deadline approaching",
        "- Multiple unanswered follow-ups",
        "",
        "DE-ESCALATE (addressed/lower urgency):",
        "- Positive resolution (paid, thanked, completed)",
        "- No activity + low importance",
        "",
        "STATUS FLOW:",
        "open -> action_needed -> escalated",
        "open -> in_progress -> addressed -> closed",
      ].join("\n"),
    },
    {
      user_id: userId, name: "Handle Financial Matter", auto_attach: false, is_active: true,
      summary: "Specialized for invoices, payments, banking, financial discussions.",
      instructions: [
        "FINANCIAL MATTER - for money-related cases.",
        "- Extract amounts, currencies, due dates",
        "- High importance (1-2) for amounts > 10,000 NIS",
        "- Flag overdue payments",
        "- Track: pending -> paid -> confirmed",
      ].join("\n"),
    },
    {
      user_id: userId, name: "Handle Personal Request", auto_attach: false, is_active: true,
      summary: "Handles personal/family requests and non-business communications.",
      instructions: [
        "PERSONAL REQUEST - for non-business cases.",
        "- Keep importance proportional (usually 3-5)",
        "- Don't over-classify personal conversations",
        "- Personal doesn't mean unimportant - family emergencies are urgency 1",
      ].join("\n"),
    },
    {
      user_id: userId, name: "Handle Customer Service", auto_attach: false, is_active: true,
      summary: "Handles customer complaints, service requests, support interactions.",
      instructions: [
        "CUSTOMER SERVICE - for support cases.",
        "- Track complaint -> resolution flow",
        "- Escalate if customer frustrated",
        "- De-escalate when resolution confirmed",
      ].join("\n"),
    },
    {
      user_id: userId, name: "Task Management", auto_attach: true, is_active: true,
      summary: "Creates, closes, and manages tasks based on case signals. Runs every scan.",
      instructions: [
        "TASK MANAGEMENT - manage actionable tasks for cases.",
        "",
        "CREATING TASKS (create_task):",
        "- Create a task when a signal implies a specific action is needed",
        "- Good tasks: 'Call David about invoice', 'Send Q1 report to board', 'Follow up on payment'",
        "- Bad tasks: 'Read email', 'Think about it', 'Case exists' (too vague)",
        "- Set due_at when there's a real deadline (meeting date, legal deadline, promised date)",
        "- Set scheduled_at when the action should happen at a specific time",
        "- Hebrew titles preferred, matching the case language",
        "- Max 3 tasks per scan - only actionable items",
        "",
        "CLOSING TASKS (close_task):",
        "- Close a task when signals indicate the action was completed",
        "- Payment confirmed -> close 'Follow up on payment'",
        "- Meeting happened -> close 'Schedule meeting'",
        "- Don't close tasks speculatively - only on evidence",
        "",
        "UPDATING TASKS (update_task):",
        "- Update due_at if deadline changed",
        "- Update scheduled_at if timing changed",
        "- Update title if the task scope changed",
        "",
        "DO NOT create tasks that duplicate existing open tasks for the same case.",
        "Check the OPEN TASKS list before creating new ones.",
      ].join("\n"),
    },
  ];

  const { data: skillData, error } = await db.from("skills").insert(skills).select("name, auto_attach");
  if (error) { console.error("Skills error:", error.message); return; }
  console.log("\nSkills created:", skillData.length);
  skillData.forEach(s => console.log(" ", s.auto_attach ? "[AUTO]" : "[PULL]", s.name));

  // Fire test signals (pending — no case created, AI will triage)
  console.log("\n--- Firing test signals ---");
  const simGate = gateData.find(g => g.display_name === "Simulator");

  const testSignals = [
    { sender: "David Cohen", content: "Hi, the invoice for project Alpha is overdue by 2 weeks. Amount is 45,000 NIS. Please handle urgently.", gate_type: "email" },
    { sender: "Mom", content: "Can you pick up milk on the way home?", gate_type: "whatsapp" },
    { sender: "Yael from Acme Corp", content: "We need to schedule the quarterly review meeting. The board wants to see the Q1 results by Thursday.", gate_type: "email" },
    { sender: "David Cohen", content: "Following up on the invoice - still unpaid. This is the third reminder.", gate_type: "email" },
  ];

  for (const sig of testSignals) {
    const now = new Date().toISOString();
    const { data: signal } = await db.from("signals").insert({
      user_id: userId, gate_id: simGate.id, case_id: null,
      status: "pending",
      raw_payload: { gate_type: sig.gate_type, sender_name: sig.sender, content: sig.content },
      sender_identifier: sig.sender, channel_identifier: "Simulator",
      occurred_at: now, received_at: now,
    }).select("id").single();

    console.log("Created signal", signal.id.slice(0, 8), "from", sig.sender, "-", sig.content.slice(0, 50));
  }

  console.log("\n4 test signals created as pending — AI will triage on next scan.");
  console.log("Signals will be triaged and assigned to cases on next cron run.");
}

main().catch(console.error);
