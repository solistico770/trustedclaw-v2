/**
 * reset.js — Wipe signals, cases, entities, tasks, events, logs.
 * PRESERVES: gates (live WA/TG connections), skills, settings, api_keys.
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

async function wipe(table, filter) {
  console.log(`  deleting ${table}...`);
  const q = typeof filter === "function" ? filter(db.from(table).delete()) : db.from(table).delete().eq("user_id", filter);
  const { error, count } = await q;
  if (error) console.error(`  ✗ ${table}:`, error.message);
  else console.log(`  ✓ ${table} done`);
}

async function main() {
  const { data: profiles } = await db.from("profiles").select("id, role");
  if (!profiles?.length) { console.error("No users found. Sign up first."); return; }
  const userId = profiles[0].id;
  console.log("User:", userId, "role:", profiles[0].role);

  // ── WIPE CASE DATA (order matters for FK constraints) ──
  // Does NOT touch: gates, skills, settings, api_keys, entity_types
  console.log("\n--- Wiping signals, cases, entities, tasks ---");

  // 1. Clear admin_entity_id FK on user_settings
  console.log("  clearing admin_entity_id...");
  const { error: settErr } = await db.from("user_settings").update({ admin_entity_id: null }).eq("user_id", userId);
  if (settErr) console.error("  ✗ user_settings:", settErr.message);
  else console.log("  ✓ user_settings done");

  // 2. Leaf tables (no dependents) — parallel
  await Promise.all([
    wipe("audit_logs", userId),
    wipe("case_events", userId),
    wipe("scan_logs", userId),
    wipe("listener_responses", userId),
    wipe("tasks", userId),
  ]);

  // 3. listener_commands (after responses cleared)
  await wipe("listener_commands", userId);

  // 4. case_entities junction — bulk delete via case IDs
  const { data: userCases } = await db.from("cases").select("id").eq("user_id", userId);
  const caseIds = (userCases || []).map(c => c.id);
  if (caseIds.length) {
    await wipe("case_entities", q => q.in("case_id", caseIds));
  }

  // 5. Signals + Cases (after junctions cleared) — parallel
  await Promise.all([
    wipe("signals", userId),
    wipe("cases", userId),
  ]);

  // 6. Entities (after tasks + cases cleared)
  await wipe("entities", userId);

  // Verify
  const { count: sigCount } = await db.from("signals").select("*", { count: "exact", head: true }).eq("user_id", userId);
  const { count: caseCount } = await db.from("cases").select("*", { count: "exact", head: true }).eq("user_id", userId);
  const { count: entCount } = await db.from("entities").select("*", { count: "exact", head: true }).eq("user_id", userId);
  console.log(`Wiped. Signals: ${sigCount || 0}, Cases: ${caseCount || 0}, Entities: ${entCount || 0}`);

  // Show what's preserved
  const { data: gates } = await db.from("gates").select("type, display_name, metadata").eq("user_id", userId);
  const { data: skills } = await db.from("skills").select("name, auto_attach").eq("user_id", userId);
  const { data: keys } = await db.from("api_keys").select("name, key_prefix").eq("user_id", userId).is("revoked_at", null);

  console.log("\n--- Preserved ---");
  console.log("Gates:", (gates || []).map(g => {
    const meta = g.metadata || {};
    const status = meta.wa_status || meta.tg_status || g.type;
    return `${g.display_name} (${status})`;
  }).join(", ") || "none");
  console.log("Skills:", (skills || []).map(s => `${s.auto_attach ? "[AUTO]" : "[PULL]"} ${s.name}`).join(", ") || "none");
  console.log("API Keys:", (keys || []).map(k => `${k.name} (${k.key_prefix}...)`).join(", ") || "none");

  console.log("\n=== RESET COMPLETE ===");
  console.log("Gates and connections are LIVE. Skills preserved. Only data wiped.");
}

main().catch(console.error);
