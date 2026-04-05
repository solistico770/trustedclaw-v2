"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { FilterBar, useFilterState, type FilterPill } from "@/components/filter-bar";
import { EntityBadge } from "@/components/entity-badge";
import { useDrawerStack } from "@/components/drawer-stack";
import { ENTITY_TYPE } from "@/lib/status-colors";
import { Badge } from "@/components/ui/badge";

type Entity = { id: string; type: string; canonical_name: string; status: string; phone?: string; email?: string; created_at: string };

const TYPE_ICONS: Record<string, string> = {
  person: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
  company: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
  project: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
  invoice: "M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z",
  other: "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z",
};

export default function EntitiesPage() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterState, setFilterState] = useFilterState();
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    if (typeof window !== "undefined") return (localStorage.getItem("tc-entities-view") as "grid" | "list") || "grid";
    return "grid";
  });
  const { openDrawer } = useDrawerStack();

  const load = useCallback(async () => {
    const params = `status=active`;
    const res = await (await fetch(`/api/entities?${params}`)).json();
    setEntities(res?.data || (Array.isArray(res) ? res : []));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function toggleView() {
    const next = viewMode === "grid" ? "list" : "grid";
    setViewMode(next);
    localStorage.setItem("tc-entities-view", next);
  }

  // Type counts
  const typeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    entities.forEach(e => { c[e.type] = (c[e.type] || 0) + 1; });
    return c;
  }, [entities]);

  const pills: FilterPill[] = useMemo(() =>
    ["person", "company", "project", "invoice", "other"]
      .filter(t => (typeCounts[t] || 0) > 0)
      .map(t => ({
        key: t,
        label: t,
        count: typeCounts[t] || 0,
        color: ENTITY_TYPE[t as keyof typeof ENTITY_TYPE]?.bg,
      })),
  [typeCounts]);

  // Filter
  const filtered = useMemo(() => {
    let result = entities;
    if (filterState.activePills.length > 0) {
      result = result.filter(e => filterState.activePills.includes(e.type));
    }
    if (filterState.search) {
      const s = filterState.search.toLowerCase();
      result = result.filter(e =>
        e.canonical_name.toLowerCase().includes(s) ||
        (e.phone || "").includes(s) ||
        (e.email || "").toLowerCase().includes(s)
      );
    }
    return result;
  }, [entities, filterState]);

  function openEntity(e: Entity) {
    openDrawer({
      id: `entity-${e.id}`,
      title: e.canonical_name,
      width: 520,
      content: <EntityBadge id={e.id} name={e.canonical_name} type={e.type} onClick={() => {}} />,
    });
    // Actually open the entity drawer content directly
    openDrawer({
      id: `entity-${e.id}`,
      title: e.canonical_name,
      width: 520,
      content: <LazyEntityContent entityId={e.id} />,
    });
  }

  if (loading) return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-pulse">{[1,2,3,4,5,6].map(i => <div key={i} className="h-24 rounded-xl bg-card" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-bold tracking-tight">Entities</h1>
        <span className="text-xs text-muted-foreground tabular-nums">{filtered.length} of {entities.length}</span>
        <div className="flex-1" />
        {/* View toggle */}
        <button onClick={toggleView} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted/50">
          {viewMode === "grid" ? "List" : "Grid"}
        </button>
      </div>

      <FilterBar
        config={{ viewKey: "entities", pills, searchPlaceholder: "Search name, phone, email... (/)" }}
        state={filterState}
        onChange={setFilterState}
      />

      {filtered.length === 0 && (
        <div className="text-center py-16">
          <p className="text-lg font-semibold text-foreground/80">No entities</p>
          <p className="text-sm text-muted-foreground mt-1">Entities are discovered by the agent when scanning cases</p>
        </div>
      )}

      {/* Grid view */}
      {viewMode === "grid" && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(e => {
            const cfg = ENTITY_TYPE[e.type as keyof typeof ENTITY_TYPE] || ENTITY_TYPE.other;
            const icon = TYPE_ICONS[e.type] || TYPE_ICONS.other;
            return (
              <button key={e.id}
                className={`rounded-xl border p-4 text-right transition-all hover:shadow-sm hover:scale-[1.01] active:scale-[0.99] ${cfg.bg} ${cfg.border}`}
                onClick={() => openEntity(e)}>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/50 dark:bg-white/10 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{e.canonical_name}</p>
                    <Badge variant="outline" className="text-[9px] mt-1 border-current/20">{e.type}</Badge>
                  </div>
                </div>
                <div className="mt-3 flex gap-3 text-[11px] opacity-70 flex-wrap">
                  {e.phone && <span className="font-mono">{e.phone}</span>}
                  {e.email && <span className="truncate">{e.email}</span>}
                  <span>since {new Date(e.created_at).toLocaleDateString("he-IL")}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* List view */}
      {viewMode === "list" && filtered.length > 0 && (
        <div className="rounded-xl border border-border/40 overflow-hidden divide-y divide-border/20">
          {filtered.map(e => {
            const cfg = ENTITY_TYPE[e.type as keyof typeof ENTITY_TYPE] || ENTITY_TYPE.other;
            return (
              <button key={e.id}
                className="w-full flex items-center gap-3 px-4 py-[var(--space-row)] hover:bg-muted/20 transition-colors text-right"
                onClick={() => openEntity(e)}>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${cfg.bg}`}>{cfg.icon}</span>
                <span className="text-[13px] font-semibold flex-1 truncate">{e.canonical_name}</span>
                <Badge variant="outline" className="text-[9px] shrink-0">{e.type}</Badge>
                {e.phone && <span className="text-[11px] text-muted-foreground font-mono shrink-0">{e.phone}</span>}
                {e.email && <span className="text-[11px] text-muted-foreground truncate max-w-[140px] shrink-0">{e.email}</span>}
                <span className="text-[10px] text-muted-foreground shrink-0">{new Date(e.created_at).toLocaleDateString("he-IL")}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Lazy entity drawer content (reuses entity-badge's drawer)
import { useEffect as useEff2, useState as useSt2, useCallback as useCb2 } from "react";

function LazyEntityContent({ entityId }: { entityId: string }) {
  const [entity, setEntity] = useSt2<Record<string, unknown> | null>(null);
  const [connections, setConnections] = useSt2<Array<{
    entity_id: string; canonical_name: string; type: string;
    shared_case_count: number; shared_cases: Array<{ id: string; case_number: number; title: string }>;
  }>>([]);
  const [loading, setLoading] = useSt2(true);
  const { openDrawer } = useDrawerStack();

  const load = useCb2(async () => {
    const [entRes, connRes] = await Promise.all([
      fetch(`/api/entities/${entityId}`),
      fetch(`/api/entities/${entityId}/connections`),
    ]);
    if (entRes.ok) { const d = await entRes.json(); setEntity(d.entity || d); }
    if (connRes.ok) { const d = await connRes.json(); setConnections(d.connections || []); }
    setLoading(false);
  }, [entityId]);

  useEff2(() => { load(); }, [load]);

  if (loading) return <div className="p-6 animate-pulse space-y-3"><div className="h-8 bg-muted rounded-lg" /><div className="h-20 bg-muted rounded-lg" /></div>;
  if (!entity) return <p className="p-6 text-muted-foreground">Entity not found</p>;

  const etype = ENTITY_TYPE[(entity.type as string) as keyof typeof ENTITY_TYPE] || ENTITY_TYPE.other;
  const strong = connections.filter(c => c.shared_case_count >= 3);
  const related = connections.filter(c => c.shared_case_count < 3);

  return (
    <div className="p-5 space-y-5">
      <div className="flex items-start gap-3">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${etype.bg}`}>{etype.icon}</div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold">{String(entity.canonical_name)}</h3>
          <Badge variant="outline" className="text-[10px] mt-1">{String(entity.type)}</Badge>
          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            {entity.phone ? <p>Tel: {String(entity.phone)}</p> : null}
            {entity.email ? <p>{String(entity.email)}</p> : null}
          </div>
        </div>
      </div>
      {connections.length > 0 && (
        <section>
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Connections ({connections.length})</h4>
          {strong.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] text-muted-foreground/60 uppercase mb-1">Strong (3+ shared cases)</p>
              {strong.map(c => (
                <button key={c.entity_id} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted/30 text-right"
                  onClick={() => openDrawer({ id: `entity-${c.entity_id}`, title: c.canonical_name, width: 520, content: <LazyEntityContent entityId={c.entity_id} /> })}>
                  <span className="text-xs font-medium flex-1 truncate">{c.canonical_name}</span>
                  <span className="text-[10px] text-muted-foreground">{c.shared_case_count} cases</span>
                </button>
              ))}
            </div>
          )}
          {related.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground/60 uppercase mb-1">Related</p>
              {related.map(c => (
                <button key={c.entity_id} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted/30 text-right"
                  onClick={() => openDrawer({ id: `entity-${c.entity_id}`, title: c.canonical_name, width: 520, content: <LazyEntityContent entityId={c.entity_id} /> })}>
                  <span className="text-xs font-medium flex-1 truncate">{c.canonical_name}</span>
                  <span className="text-[10px] text-muted-foreground">{c.shared_case_count} cases</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
