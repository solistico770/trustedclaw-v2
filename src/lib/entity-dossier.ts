import { SupabaseClient } from "@supabase/supabase-js";

type EntityRow = {
  id: string;
  canonical_name: string;
  type: string;
  status: string;
  phone: string | null;
  wa_jid: string | null;
  tg_user_id: string | null;
  telegram_handle: string | null;
  email: string | null;
  metadata: Record<string, unknown> | null;
};

type CaseLink = { id: string; case_id: string; case_number: number; title: string; status: string };
type RelatedEntity = { canonical_name: string; type: string };

/**
 * Build a concise LLM-ready dossier for a single entity.
 * Target: ~150 tokens max.
 */
export async function buildEntityDossier(
  db: SupabaseClient,
  entityId: string,
): Promise<string | null> {
  const dossiers = await buildBatchDossiers(db, [entityId]);
  return dossiers || null;
}

/**
 * Build dossiers for multiple entities in batch (O(1) queries, not O(N)).
 * Returns a single formatted string with all dossiers separated by newlines.
 */
export async function buildBatchDossiers(
  db: SupabaseClient,
  entityIds: string[],
): Promise<string> {
  if (entityIds.length === 0) return "";

  // 1. Fetch all entities
  const { data: entities } = await db.from("entities")
    .select("id, canonical_name, type, status, phone, wa_jid, tg_user_id, telegram_handle, email, metadata")
    .in("id", entityIds);

  if (!entities || entities.length === 0) return "";

  // 2. Fetch case links for all entities (limit 5 per entity via post-processing)
  const { data: caseLinks } = await db.from("case_entities")
    .select("entity_id, cases(id, case_number, title, status)")
    .in("entity_id", entityIds);

  // 3. Fetch signal counts (last 7 days) for all entities
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: signalCounts } = await db.from("signal_entities")
    .select("entity_id, signals(occurred_at)")
    .in("entity_id", entityIds);

  // 4. Fetch related entities (via shared cases)
  const { data: relatedLinks } = await db.from("case_entities")
    .select("case_id, entity_id, entities(canonical_name, type)")
    .in("case_id", (caseLinks || []).map(cl => {
      const c = cl.cases as unknown as { id: string };
      return c?.id;
    }).filter(Boolean));

  // Build per-entity data
  const dossiers: string[] = [];

  for (const entity of entities as EntityRow[]) {
    const lines: string[] = [];

    // Identity line
    lines.push(`ENTITY: ${entity.canonical_name} (${entity.type}) [${entity.status}]`);

    // Contact fields
    const contacts: string[] = [];
    if (entity.phone) contacts.push(`Phone: ${entity.phone}`);
    if (entity.wa_jid) contacts.push(`WA: ${entity.wa_jid}`);
    if (entity.tg_user_id) contacts.push(`TG ID: ${entity.tg_user_id}`);
    if (entity.telegram_handle) contacts.push(`TG: ${entity.telegram_handle}`);
    if (entity.email) contacts.push(`Email: ${entity.email}`);
    const meta = entity.metadata || {};
    if (meta.company) contacts.push(`Company: ${meta.company}`);
    if (meta.title) contacts.push(`Role: ${meta.title}`);
    if (contacts.length > 0) lines.push(`  ${contacts.join(" | ")}`);

    // Open cases (limit 5)
    const entityCases = (caseLinks || [])
      .filter(cl => cl.entity_id === entity.id)
      .map(cl => cl.cases as unknown as CaseLink)
      .filter(c => c && c.status !== "closed" && c.status !== "merged")
      .slice(0, 5);

    if (entityCases.length > 0) {
      const caseList = entityCases.map(c => `Case #${c.case_number} "${(c.title || "untitled").slice(0, 40)}"`).join(", ");
      lines.push(`  Open Cases: ${entityCases.length} (${caseList})`);
    }

    // Signal count (last 7 days)
    const entitySignals = (signalCounts || [])
      .filter(sc => sc.entity_id === entity.id);
    const recentSignals = entitySignals.filter(sc => {
      const sig = sc.signals as unknown as { occurred_at: string } | null;
      return sig && sig.occurred_at >= sevenDaysAgo;
    });
    if (recentSignals.length > 0) {
      lines.push(`  Recent Signals (last 7d): ${recentSignals.length} messages`);
    }

    // Last contact time
    const allSignalTimes = entitySignals
      .map(sc => (sc.signals as unknown as { occurred_at: string } | null)?.occurred_at)
      .filter(Boolean)
      .sort()
      .reverse();
    if (allSignalTimes.length > 0) {
      const lastContact = allSignalTimes[0]!;
      const ago = formatTimeAgo(new Date(lastContact));
      lines.push(`  Last Contact: ${ago}`);
    }

    // Related entities (limit 5, from shared cases)
    const entityCaseIds = entityCases.map(c => c.id);
    const related = new Map<string, RelatedEntity>();
    for (const rl of relatedLinks || []) {
      if (!entityCaseIds.includes(rl.case_id)) continue;
      if (rl.entity_id === entity.id) continue;
      const ent = rl.entities as unknown as RelatedEntity | null;
      if (ent && !related.has(rl.entity_id)) {
        related.set(rl.entity_id, ent);
      }
      if (related.size >= 5) break;
    }
    if (related.size > 0) {
      const relList = [...related.values()].map(r => `${r.canonical_name} (${r.type})`).join(", ");
      lines.push(`  Related Entities: ${relList}`);
    }

    // Token budget: truncate if dossier text > 600 chars (~150 tokens)
    let dossier = lines.join("\n");
    if (dossier.length > 600) {
      dossier = dossier.slice(0, 597) + "...";
    }

    dossiers.push(dossier);
  }

  return dossiers.join("\n");
}

function formatTimeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
