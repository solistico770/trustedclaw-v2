"use client";
import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Play, Plus, Pencil, Trash2, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

type Ched = {
  id: string;
  title: string;
  context: string;
  trigger_type: "interval" | "after_llm_change";
  interval_seconds: number | null;
  is_active: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  last_result: string | null;
  created_at: string;
};

type ChedRun = {
  id: string;
  trigger_reason: string;
  result_text: string | null;
  commands_executed: Array<{ type: string; status: string; detail?: string }>;
  duration_ms: number | null;
  ran_at: string;
};

function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) {
    const absDiff = Math.abs(diff);
    if (absDiff < 60000) return `in ${Math.round(absDiff / 1000)}s`;
    if (absDiff < 3600000) return `in ${Math.round(absDiff / 60000)}m`;
    return `in ${Math.round(absDiff / 3600000)}h`;
  }
  if (diff < 60000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
  return `${Math.round(diff / 86400000)}d ago`;
}

function humanInterval(seconds: number | null) {
  if (!seconds) return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

const UNITS = [
  { label: "Minutes", mult: 60 },
  { label: "Hours", mult: 3600 },
  { label: "Days", mult: 86400 },
];

export default function ChedsPage() {
  const [cheds, setCheds] = useState<Ched[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<string, ChedRun[]>>({});
  const [runningId, setRunningId] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [context, setContext] = useState("");
  const [triggerType, setTriggerType] = useState<"interval" | "after_llm_change">("interval");
  const [intervalVal, setIntervalVal] = useState(1);
  const [intervalUnit, setIntervalUnit] = useState(3600); // hours

  const load = useCallback(async () => {
    const res = await fetch("/api/cheds");
    if (res.ok) {
      const json = await res.json();
      setCheds(json.data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function resetForm() {
    setTitle(""); setContext(""); setTriggerType("interval");
    setIntervalVal(1); setIntervalUnit(3600);
    setEditId(null); setShowForm(false);
  }

  function startEdit(c: Ched) {
    setTitle(c.title);
    setContext(c.context);
    setTriggerType(c.trigger_type);
    if (c.interval_seconds) {
      for (const u of [...UNITS].reverse()) {
        if (c.interval_seconds >= u.mult && c.interval_seconds % u.mult === 0) {
          setIntervalVal(c.interval_seconds / u.mult);
          setIntervalUnit(u.mult);
          break;
        }
      }
    }
    setEditId(c.id);
    setShowForm(true);
  }

  async function handleSubmit() {
    const interval_seconds = triggerType === "interval" ? intervalVal * intervalUnit : null;
    const body = { title, context, trigger_type: triggerType, interval_seconds };

    if (editId) {
      await fetch(`/api/cheds/${editId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else {
      await fetch("/api/cheds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    resetForm();
    load();
  }

  async function handleToggle(id: string) {
    await fetch(`/api/cheds/${id}/toggle`, { method: "POST" });
    load();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/cheds/${id}`, { method: "DELETE" });
    load();
  }

  async function handleRunNow(id: string) {
    setRunningId(id);
    const res = await fetch(`/api/cheds/${id}/run`, { method: "POST" });
    if (res.ok) {
      const result = await res.json();
      // Update local state with result
      setCheds(prev => prev.map(c => c.id === id ? { ...c, last_run_at: new Date().toISOString(), last_result: result.report } : c));
    }
    setRunningId(null);
    load();
  }

  async function handleExpand(id: string) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!runs[id]) {
      const res = await fetch(`/api/cheds/${id}`);
      if (res.ok) {
        const data = await res.json();
        setRuns(prev => ({ ...prev, [id]: data.runs || [] }));
      }
    }
  }

  if (loading) return <div className="p-8 text-muted-foreground">Loading cheds...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Cheds</h1>
        <Button size="sm" onClick={() => { resetForm(); setShowForm(!showForm); }}>
          <Plus className="w-4 h-4 mr-1" /> New Ched
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-5 space-y-3">
            <Input placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
            <Textarea placeholder="Instructions for the LLM — what to check, what to report..." rows={4} value={context} onChange={e => setContext(e.target.value)} />
            <div className="flex gap-4 items-center">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="trigger" checked={triggerType === "interval"} onChange={() => setTriggerType("interval")} />
                Run every
              </label>
              {triggerType === "interval" && (
                <div className="flex gap-2 items-center">
                  <Input type="number" min={1} className="w-20" value={intervalVal} onChange={e => setIntervalVal(Number(e.target.value))} />
                  <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={intervalUnit} onChange={e => setIntervalUnit(Number(e.target.value))}>
                    {UNITS.map(u => <option key={u.mult} value={u.mult}>{u.label}</option>)}
                  </select>
                </div>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="trigger" checked={triggerType === "after_llm_change"} onChange={() => setTriggerType("after_llm_change")} />
                After LLM changes
              </label>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSubmit} disabled={!title.trim() || !context.trim()}>
                {editId ? "Update" : "Create"}
              </Button>
              <Button size="sm" variant="ghost" onClick={resetForm}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {cheds.length === 0 && !showForm && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p className="text-lg mb-2">No cheds yet</p>
            <p className="text-sm">Create your first scheduled check to automate reports and monitoring.</p>
          </CardContent>
        </Card>
      )}

      {cheds.map(c => (
        <Card key={c.id} className={!c.is_active ? "opacity-60" : ""}>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold truncate">{c.title}</span>
                  <Badge variant={c.is_active ? "default" : "secondary"} className="text-[10px]">
                    {c.is_active ? "Active" : "Paused"}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {c.trigger_type === "interval" ? `Every ${humanInterval(c.interval_seconds)}` : "After LLM change"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{c.context}</p>
                <div className="flex gap-4 text-[11px] text-muted-foreground">
                  <span>Last: {timeAgo(c.last_run_at)}</span>
                  {c.trigger_type === "interval" && <span>Next: {timeAgo(c.next_run_at)}</span>}
                </div>
                {c.last_result && (
                  <p className="text-xs mt-1.5 text-foreground/80 line-clamp-2 bg-muted/50 rounded px-2 py-1">{c.last_result}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleRunNow(c.id)} disabled={runningId === c.id}>
                  {runningId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleToggle(c.id)}>
                  <span className="text-[10px] font-bold">{c.is_active ? "⏸" : "▶"}</span>
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(c)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(c.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleExpand(c.id)}>
                  {expandedId === c.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>

            {expandedId === c.id && (
              <div className="mt-3 border-t pt-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Recent Runs</p>
                {(!runs[c.id] || runs[c.id].length === 0) && (
                  <p className="text-xs text-muted-foreground">No runs yet</p>
                )}
                {(runs[c.id] || []).map(r => (
                  <div key={r.id} className="text-xs bg-muted/30 rounded px-3 py-2 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{r.trigger_reason}</Badge>
                      <span className="text-muted-foreground">{timeAgo(r.ran_at)}</span>
                      {r.duration_ms && <span className="text-muted-foreground">{r.duration_ms}ms</span>}
                      {r.commands_executed.length > 0 && (
                        <span className="text-muted-foreground">{r.commands_executed.length} cmd(s)</span>
                      )}
                    </div>
                    {r.result_text && <p className="text-foreground/80">{r.result_text}</p>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
