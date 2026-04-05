"use client";

import { useEffect, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CASE_STATUS, URGENCY_BG, ENTITY_TYPE } from "@/lib/status-colors";
import { URGENCY_LABELS, IMPORTANCE_LABELS, LEVEL_COLORS, getScanIntervalSeconds, getScanIntervalLabel } from "@/lib/scan-intervals";
import { TasksPanel } from "@/components/tasks-panel";
import { EntityBadge } from "@/components/entity-badge";

type CaseData = {
  case: Record<string, unknown>;
  messages: Array<{ id: string; raw_payload: Record<string, string>; sender_identifier: string; occurred_at: string }>;
  entities: Array<{ role: string; entities: { id: string; canonical_name: string; type: string } | null }>;
  case_events: Array<Record<string, unknown>>;
  history: Array<{ id: string; actor: string; action_type: string; reasoning: string; created_at: string }>;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("he-IL", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function CaseDrawerContent({ caseId, onRefresh }: { caseId: string; onRefresh?: () => void }) {
  const [data, setData] = useState<CaseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [tab, setTab] = useState<"signals" | "tasks" | "entities" | "agent" | "history">("signals");

  const load = useCallback(async () => {
    const res = await fetch(`/api/cases/${caseId}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [caseId]);

  useEffect(() => { load(); }, [load]);

  async function changeStatus(status: string) {
    await fetch(`/api/cases/${caseId}/status`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
    onRefresh?.();
  }

  async function scanNow() {
    setScanning(true);
    await fetch(`/api/agent/scan/${caseId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    await load();
    setScanning(false);
  }

  if (loading) return <div className="p-6 space-y-3 animate-pulse"><div className="h-8 bg-muted rounded-lg" /><div className="h-32 bg-muted rounded-lg" /></div>;
  if (!data?.case) return <p className="p-6 text-muted-foreground">Case not found.</p>;

  const c = data.case;
  const st = CASE_STATUS[(c.status as string) as keyof typeof CASE_STATUS] || CASE_STATUS.open;
  const scanInterval = getScanIntervalSeconds(c.urgency as number, c.importance as number);

  // Dedup entities
  const seen = new Set<string>();
  const entities = (data.entities || []).filter(ce => {
    const n = ce.entities?.canonical_name?.toLowerCase();
    if (!n || seen.has(n)) return false;
    seen.add(n); return true;
  });

  const TABS = [
    { key: "signals" as const, label: `Signals (${data.messages?.length || 0})` },
    { key: "tasks" as const, label: "Tasks" },
    { key: "entities" as const, label: `Entities (${entities.length})` },
    { key: "agent" as const, label: `Agent (${data.case_events?.length || 0})` },
    { key: "history" as const, label: "Log" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-5 border-b border-border/30 space-y-3 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground">#{c.case_number as number}</span>
          <span className={`w-2 h-2 rounded-full ${st.dot}`} />
          <Badge className={`text-[10px] ${st.bg}`}>{st.label}</Badge>
          <span className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center ${URGENCY_BG[c.urgency as number]}`}>{c.urgency as number}</span>
        </div>
        <h2 className="text-lg font-bold leading-tight">{c.title as string || `Case #${c.case_number}`}</h2>
        {c.summary ? <p className="text-sm text-muted-foreground leading-relaxed">{String(c.summary)}</p> : null}

        {/* Info chips */}
        <div className="flex gap-2 text-[10px] text-muted-foreground flex-wrap">
          <span>U{c.urgency as number} {URGENCY_LABELS[c.urgency as number]}</span>
          <span>I{c.importance as number} {IMPORTANCE_LABELS[c.importance as number]}</span>
          <span>Scan: {getScanIntervalLabel(scanInterval)}</span>
          <span>{(c.message_count as number) || 0} signals</span>
        </div>

        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" className="h-7 text-xs" onClick={scanNow} disabled={scanning}>{scanning ? "Scanning..." : "Scan Now"}</Button>
          {c.status !== "in_progress" && c.status !== "closed" && <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => changeStatus("in_progress")}>Working</Button>}
          {c.status !== "addressed" && c.status !== "closed" && <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => changeStatus("addressed")}>Done</Button>}
          {c.status !== "closed" && <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => changeStatus("closed")}>Close</Button>}
          {c.status === "closed" && <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => changeStatus("open")}>Reopen</Button>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 px-3 py-1.5 border-b border-border/30 bg-muted/20 shrink-0 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-all whitespace-nowrap ${
              tab === t.key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content — scrollable */}
      <div className="flex-1 overflow-y-auto">
        {tab === "signals" && <SignalsTab messages={data.messages || []} />}
        {tab === "tasks" && <div className="p-4"><TasksPanel caseId={caseId} /></div>}
        {tab === "entities" && <EntitiesTab entities={entities} />}
        {tab === "agent" && <AgentTab events={data.case_events || []} scanNow={scanNow} scanning={scanning} />}
        {tab === "history" && <HistoryTab history={data.history || []} />}
      </div>
    </div>
  );
}

/* ── Signals Tab (chat-thread) ── */
function SignalsTab({ messages }: { messages: CaseData["messages"] }) {
  if (messages.length === 0) return <p className="text-xs text-muted-foreground text-center py-8">No signals yet.</p>;
  return (
    <div className="p-4 space-y-2">
      {messages.map(m => {
        const p = m.raw_payload || {};
        const isMe = p.direction === "outgoing";
        return (
          <div key={m.id} className={`flex gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-[10px] font-bold shrink-0">
              {(m.sender_identifier || "?")[0]?.toUpperCase()}
            </div>
            <div className={`max-w-[80%] ${isMe ? "items-end" : ""}`}>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[11px] font-medium text-foreground/70">{m.sender_identifier}</span>
                <span className="text-[10px] text-muted-foreground/50">{fmtDate(m.occurred_at)}</span>
              </div>
              <div className={`rounded-xl px-3 py-2 text-sm leading-relaxed ${isMe ? "bg-primary/5 dark:bg-primary/10" : "bg-muted/40"}`}>
                {p.content}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Entities Tab ── */
function EntitiesTab({ entities }: { entities: CaseData["entities"] }) {
  if (entities.length === 0) return <p className="text-xs text-muted-foreground text-center py-8">No entities linked.</p>;
  return (
    <div className="p-4">
      <div className="flex gap-2 flex-wrap">
        {entities.map((ce, i) => ce.entities && (
          <EntityBadge key={i} id={ce.entities.id} name={ce.entities.canonical_name} type={ce.entities.type} />
        ))}
      </div>
    </div>
  );
}

/* ── Agent Tab ── */
function AgentTab({ events, scanNow, scanning }: { events: Array<Record<string, unknown>>; scanNow: () => void; scanning: boolean }) {
  if (events.length === 0) return (
    <div className="text-center py-8">
      <p className="text-sm text-muted-foreground">No agent interactions yet</p>
      <Button size="sm" className="mt-3" onClick={scanNow} disabled={scanning}>{scanning ? "Scanning..." : "Run First Scan"}</Button>
    </div>
  );
  return (
    <div className="p-4 space-y-3">
      {events.map((ev) => (
        <div key={ev.id as string} className="bg-muted/20 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="text-[10px]">{ev.event_type as string}</Badge>
            <Badge className={`text-[10px] ${(ev.status as string) === "failed" ? "bg-red-500/15 text-red-600 dark:text-red-400" : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"}`}>
              {(ev.status as string) || "success"}
            </Badge>
            <span className="text-[10px] text-muted-foreground">{fmtDate(ev.created_at as string)}</span>
            <span className="text-[10px] text-muted-foreground">{ev.tokens_used as number} tok · {ev.duration_ms as number}ms</span>
          </div>
          {ev.empowerment_line ? (
            <div className="bg-primary/5 border border-primary/15 rounded-lg px-3 py-2 text-xs">{String(ev.empowerment_line)}</div>
          ) : null}
          {(ev.out_raw as Record<string, unknown>)?.reasoning ? (
            <p className="text-xs text-foreground/80">{String((ev.out_raw as Record<string, string>).reasoning)}</p>
          ) : null}
          {Array.isArray(ev.skills_pulled) && ev.skills_pulled.length > 0 ? (
            <div className="flex gap-1 flex-wrap">
              {(ev.skills_pulled as string[]).map((s: string, j: number) => <Badge key={j} className="bg-primary/15 text-primary text-[9px]">{s}</Badge>)}
            </div>
          ) : null}
          {ev.error_message ? <p className="text-xs text-red-500 font-mono bg-red-500/5 p-2 rounded">{String(ev.error_message)}</p> : null}
          <details>
            <summary className="text-[10px] text-primary cursor-pointer hover:underline">Full context</summary>
            <pre className="mt-1 text-[10px] text-muted-foreground whitespace-pre-wrap bg-muted p-2 rounded-lg max-h-40 overflow-auto font-mono">
              {JSON.stringify(ev.in_context, null, 2)}
            </pre>
          </details>
        </div>
      ))}
    </div>
  );
}

/* ── History Tab ── */
function HistoryTab({ history }: { history: CaseData["history"] }) {
  if (!history || history.length === 0) return <p className="text-xs text-muted-foreground text-center py-8">No history.</p>;
  return (
    <div className="p-4 space-y-1">
      {history.map((h, i) => (
        <div key={i} className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-muted/20 text-xs">
          <span className="text-[10px] text-muted-foreground w-28 shrink-0 font-mono">{fmtDate(h.created_at)}</span>
          <Badge variant="secondary" className="text-[9px] shrink-0">{h.actor}</Badge>
          <span className="text-foreground/70">{h.action_type}</span>
          {h.reasoning && <span className="text-muted-foreground truncate mr-auto">{h.reasoning}</span>}
        </div>
      ))}
    </div>
  );
}
