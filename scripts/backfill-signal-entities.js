/**
 * Backfill signal_entities: match existing signals.sender_identifier to entities.wa_jid
 * Run once after the entity_brain_model migration.
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
  // Get all entities with wa_jid
  const { data: entities, error: entErr } = await db
    .from("entities")
    .select("id, user_id, wa_jid")
    .not("wa_jid", "is", null);

  if (entErr) { console.error("Failed to fetch entities:", entErr.message); return; }
  if (!entities || entities.length === 0) { console.log("No entities with wa_jid found."); return; }

  console.log(`Found ${entities.length} entities with wa_jid`);

  let linked = 0;
  let skipped = 0;

  for (const entity of entities) {
    // Find signals from this sender
    const { data: signals } = await db
      .from("signals")
      .select("id")
      .eq("user_id", entity.user_id)
      .eq("sender_identifier", entity.wa_jid);

    if (!signals || signals.length === 0) continue;

    for (const signal of signals) {
      const { error } = await db
        .from("signal_entities")
        .upsert(
          { signal_id: signal.id, entity_id: entity.id, resolution_method: "auto" },
          { onConflict: "signal_id,entity_id" }
        );

      if (error) {
        skipped++;
      } else {
        linked++;
      }
    }

    console.log(`Entity "${entity.wa_jid}": linked ${signals.length} signals`);
  }

  console.log(`\nDone. Linked: ${linked}, Skipped: ${skipped}`);
}

main().catch(console.error);
