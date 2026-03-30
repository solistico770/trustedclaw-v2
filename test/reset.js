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

async function main() {
  const { data: profiles } = await db.from("profiles").select("id, role");
  if (!profiles?.length) { console.error("No users found. Sign up first."); return; }
  const userId = profiles[0].id;
  console.log("User:", userId, "role:", profiles[0].role);

  // ── WIPE CASE DATA (order matters for FK constraints) ──
  // Does NOT touch: gates, skills, settings, api_keys, entity_types
  console.log("\n--- Wiping signals, cases, entities, tasks ---");

  // 1. Clear admin_entity_id FK on user_settings
  await db.from("user_settings").update({ admin_entity_id: null }).eq("user_id", userId);

  // 2. Audit + events + scan logs
  await db.from("audit_logs").delete().eq("user_id", userId);
  await db.from("case_events").delete().eq("user_id", userId);
  await db.from("scan_logs").delete().eq("user_id", userId);

  // 3. Listener commands + responses (stale commands)
  await db.from("listener_responses").delete().eq("user_id", userId);
  await db.from("listener_commands").delete().eq("user_id", userId);

  // 4. Tasks (has entity_id FK)
  await db.from("tasks").delete().eq("user_id", userId);

  // 5. case_entities junction
  const { data: userCases } = await db.from("cases").select("id").eq("user_id", userId);
  for (const c of userCases || []) {
    await db.from("case_entities").delete().eq("case_id", c.id);
  }

  // 6. Signals
  await db.from("signals").delete().eq("user_id", userId);

  // 7. Cases
  await db.from("cases").delete().eq("user_id", userId);

  // 8. Entities
  await db.from("entities").delete().eq("user_id", userId);

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
