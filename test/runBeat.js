#!/usr/bin/env node
/**
 * runBeat.js — Replay a heartbeat file, sending signals at real-time intervals.
 * Usage: node test/runBeat.js test/heartbeat-sales-rep.json
 *
 * Loads .env.local from project root (parent of test/).
 * Each event becomes a pending signal via direct DB insert.
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });

const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

function parseTime(t) {
  const [m, s] = t.split(":").map(Number);
  return m * 60 + s;
}

function pad(n) { return String(n).padStart(2, "0"); }
function fmtTime(sec) { return `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`; }

async function main() {
  const beatFile = process.argv[2];
  if (!beatFile) {
    console.error("Usage: node test/runBeat.js <heartbeat-file.json>");
    process.exit(1);
  }

  const beatPath = path.resolve(beatFile);
  if (!fs.existsSync(beatPath)) {
    console.error("File not found:", beatPath);
    process.exit(1);
  }

  const beat = JSON.parse(fs.readFileSync(beatPath, "utf-8"));
  console.log(`\nHeartbeat: ${beat.name}`);
  console.log(`Events: ${beat.events.length}`);
  console.log(`Duration: ${beat.duration_minutes} minutes\n`);

  // Get user
  const { data: profiles } = await db.from("profiles").select("id, role");
  if (!profiles?.length) { console.error("No users found. Run reset first."); process.exit(1); }
  const userId = profiles[0].id;

  // Get gate map
  const { data: gates } = await db.from("gates").select("id, type").eq("user_id", userId);
  const gateMap = {};
  for (const g of gates || []) gateMap[g.type] = g.id;

  console.log("Gates:", Object.keys(gateMap).join(", "));
  console.log(`User: ${userId.slice(0, 8)}...\n`);

  // Speed mode check
  const speed = process.argv[3];
  const instant = speed === "--instant" || speed === "-i";

  if (instant) {
    console.log("MODE: Instant (all events fired immediately)\n");
  } else {
    console.log("MODE: Real-time (events fire at heartbeat timing)\n");
  }

  console.log("─".repeat(80));

  const startTime = Date.now();
  let sent = 0;

  for (let i = 0; i < beat.events.length; i++) {
    const ev = beat.events[i];
    const evTimeSec = parseTime(ev.time);

    if (!instant) {
      // Wait until the right time
      const elapsed = (Date.now() - startTime) / 1000;
      const waitSec = evTimeSec - elapsed;
      if (waitSec > 0) {
        await new Promise(r => setTimeout(r, waitSec * 1000));
      }
    }

    const gateId = gateMap[ev.gate];
    if (!gateId) {
      console.log(`[${ev.time}] SKIP — no gate '${ev.gate}'`);
      continue;
    }

    const now = new Date().toISOString();
    const isAdmin = ev.gate === "whatsapp"; // admin gate

    const { data: signal, error } = await db.from("signals").insert({
      user_id: userId,
      gate_id: gateId,
      case_id: null,
      status: "pending",
      raw_payload: {
        gate_type: ev.gate,
        sender_name: ev.sender,
        content: ev.content,
      },
      sender_identifier: ev.sender,
      channel_identifier: ev.gate,
      occurred_at: now,
      received_at: now,
    }).select("id").single();

    sent++;
    const shortId = signal?.id?.slice(0, 6) || "???";
    const prefix = isAdmin ? "ADMIN" : ev.gate.toUpperCase().padEnd(8);
    console.log(`[${ev.time}] #${String(sent).padStart(3)} ${prefix} ${shortId} | ${ev.sender}: ${ev.content.slice(0, 70)}`);

    if (error) {
      console.error(`  ERROR: ${error.message}`);
    }
  }

  const totalSec = Math.round((Date.now() - startTime) / 1000);
  console.log("─".repeat(80));
  console.log(`\nDone. ${sent} signals sent in ${fmtTime(totalSec)}.`);
  console.log("Signals are PENDING — AI will triage them on next cron scan.");
  console.log("Or trigger manually: curl -X POST -H 'x-cron-secret: <SECRET>' /api/agent/scan");
}

main().catch(err => { console.error(err); process.exit(1); });
