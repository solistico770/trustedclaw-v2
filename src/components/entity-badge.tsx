"use client";

import { ENTITY_TYPE } from "@/lib/status-colors";
import { useDrawerStack } from "@/components/drawer-stack";

type EntityBadgeProps = {
  id: string;
  name: string;
  type: string;
  connectionCount?: number;
  caseCount?: number;
  onClick?: () => void; // override default drawer behavior
};

export function EntityBadge({ id, name, type, connectionCount, caseCount, onClick }: EntityBadgeProps) {
  const { openDrawer } = useDrawerStack();
  const cfg = ENTITY_TYPE[type as keyof typeof ENTITY_TYPE] || ENTITY_TYPE.other;

  function handleClick() {
    if (onClick) { onClick(); return; }
    // Lazy-load entity drawer content
    openDrawer({
      id: `entity-${id}`,
      title: name,
      width: 520,
      content: <LazyEntityDrawer entityId={id} />,
    });
  }

  return (
    <button
      onClick={handleClick}
      className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md border transition-all hover:scale-[1.02] active:scale-[0.98] ${cfg.bg} ${cfg.border}`}
      title={[
        cfg.label,
        connectionCount != null ? `${connectionCount} connections` : null,
        caseCount != null ? `${caseCount} cases` : null,
      ].filter(Boolean).join(" · ")}
    >
      <span className="font-bold opacity-60 text-[9px]">{cfg.icon}</span>
      <span className="truncate max-w-[120px]">{name}</span>
      {connectionCount != null && connectionCount > 0 && (
        <span className="opacity-50 text-[9px]">{connectionCount}</span>
      )}
    </button>
  );
}

// Lazy wrapper to avoid circular imports — actual drawer content loaded dynamically
function LazyEntityDrawer({ entityId }: { entityId: string }) {
  // Inline minimal entity drawer for now; will be enhanced in task 8.5
  return <EntityDrawerContent entityId={entityId} />;
}

import { useEffect, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";

function EntityDrawerContent({ entityId }: { entityId: string }) {
  const [entity, setEntity] = useState<Record<string, unknown> | null>(null);
  const [connections, setConnections] = useState<Array<{
    entity_id: string; canonical_name: string; type: string;
    shared_case_count: number; shared_cases: Array<{ id: string; case_number: number; title: string }>;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const { openDrawer } = useDrawerStack();

  const load = useCallback(async () => {
    const [entRes, connRes] = await Promise.all([
      fetch(`/api/entities/${entityId}`),
      fetch(`/api/entities/${entityId}/connections`),
    ]);
    if (entRes.ok) {
      const d = await entRes.json();
      setEntity(d.entity || d);
    }
    if (connRes.ok) {
      const d = await connRes.json();
      setConnections(d.connections || []);
    }
    setLoading(false);
  }, [entityId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="p-6 animate-pulse space-y-3"><div className="h-8 bg-muted rounded-lg" /><div className="h-20 bg-muted rounded-lg" /></div>;
  if (!entity) return <p className="p-6 text-muted-foreground">Entity not found</p>;

  const etype = ENTITY_TYPE[(entity.type as string) as keyof typeof ENTITY_TYPE] || ENTITY_TYPE.other;
  const strong = connections.filter(c => c.shared_case_count >= 3);
  const related = connections.filter(c => c.shared_case_count < 3);

  return (
    <div className="p-5 space-y-5">
      {/* Profile */}
      <div className="flex items-start gap-3">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${etype.bg}`}>
          {etype.icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold">{entity.canonical_name as string}</h3>
          <Badge variant="outline" className="text-[10px] mt-1">{entity.type as string}</Badge>
          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            {entity.phone ? <p>Tel: {String(entity.phone)}</p> : null}
            {entity.email ? <p>{String(entity.email)}</p> : null}
            {entity.whatsapp_number ? <p>WA: {String(entity.whatsapp_number)}</p> : null}
            {entity.telegram_handle ? <p>TG: @{String(entity.telegram_handle)}</p> : null}
            {entity.website ? <p>{String(entity.website)}</p> : null}
          </div>
        </div>
      </div>

      {/* Connections */}
      {connections.length > 0 && (
        <section>
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Connections ({connections.length})</h4>
          {strong.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] text-muted-foreground/60 uppercase mb-1">Strong (3+ shared cases)</p>
              <div className="space-y-1.5">
                {strong.map(c => (
                  <ConnectionRow key={c.entity_id} conn={c} openDrawer={openDrawer} />
                ))}
              </div>
            </div>
          )}
          {related.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground/60 uppercase mb-1">Related</p>
              <div className="space-y-1.5">
                {related.map(c => (
                  <ConnectionRow key={c.entity_id} conn={c} openDrawer={openDrawer} />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {connections.length === 0 && (
        <p className="text-xs text-muted-foreground py-4 text-center">No connections found</p>
      )}
    </div>
  );
}

function ConnectionRow({ conn, openDrawer }: {
  conn: { entity_id: string; canonical_name: string; type: string; shared_case_count: number; shared_cases: Array<{ id: string; case_number: number; title: string }> };
  openDrawer: (entry: { id: string; title: string; width?: number; content: React.ReactNode }) => void;
}) {
  const cfg = ENTITY_TYPE[conn.type as keyof typeof ENTITY_TYPE] || ENTITY_TYPE.other;
  return (
    <button
      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted/30 transition-colors text-right"
      onClick={() => openDrawer({
        id: `entity-${conn.entity_id}`,
        title: conn.canonical_name,
        width: 520,
        content: <EntityDrawerContent entityId={conn.entity_id} />,
      })}
    >
      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${cfg.bg}`}>{cfg.icon}</span>
      <span className="text-xs font-medium flex-1 truncate">{conn.canonical_name}</span>
      <span className="text-[10px] text-muted-foreground">{conn.shared_case_count} cases</span>
      <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
        {conn.shared_cases[0]?.title || `#${conn.shared_cases[0]?.case_number}`}
      </span>
    </button>
  );
}
