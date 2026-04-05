"use client";

import { useEffect, useState, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";

type Task = {
  id: string; case_id: string; title: string; description: string | null;
  status: "open" | "closed"; due_at: string | null; scheduled_at: string | null;
  created_at: string; cases: { case_number: number; title: string } | null;
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("he-IL", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function isOverdue(t: Task) { return t.status === "open" && t.due_at && new Date(t.due_at) < new Date(); }
function isDueToday(t: Task) {
  if (!t.due_at || t.status !== "open") return false;
  const d = new Date(t.due_at), n = new Date();
  return d >= n && d.toDateString() === n.toDateString();
}

type TaskGroup = { key: string; title: string; accent: string; dot: string; tasks: Task[]; collapsed?: boolean };

export function TasksPanel({ caseId, cases: caseOptions }: {
  caseId?: string; // if provided, scoped to this case
  cases?: Array<{ id: string; case_number: number; title: string }>;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [newCaseId, setNewCaseId] = useState(caseId || "");
  const [newDue, setNewDue] = useState("");
  const router = useRouter();

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (caseId) params.set("case_id", caseId);
    const data = await fetch(`/api/tasks?${params}`).then(r => r.json());
    setTasks(data?.data || (Array.isArray(data) ? data : []));
    setLoading(false);
  }, [caseId]);

  useEffect(() => {
    load();
    const sb = createBrowserClient();
    const ch = sb.channel(`tasks-${caseId || "all"}`).on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => load()).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [load, caseId]);

  async function toggle(taskId: string, status: string) {
    const endpoint = status === "open" ? `/api/tasks/${taskId}/close` : `/api/tasks/${taskId}/open`;
    await fetch(endpoint, { method: "POST" });
    load();
  }

  async function create() {
    const targetCase = caseId || newCaseId;
    if (!targetCase || !newTitle) return;
    await fetch("/api/tasks", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ case_id: targetCase, title: newTitle, due_at: newDue || undefined }),
    });
    setNewTitle(""); setNewDue("");
    load();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") create();
  }

  if (loading) return <div className="space-y-2 animate-pulse p-4">{[1,2,3].map(i => <div key={i} className="h-10 bg-muted rounded-lg" />)}</div>;

  // Build groups
  const groups: TaskGroup[] = [
    { key: "overdue", title: "Overdue", accent: "text-red-600 dark:text-red-400", dot: "bg-red-500", tasks: tasks.filter(t => isOverdue(t)) },
    { key: "today", title: "Due Today", accent: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500", tasks: tasks.filter(t => isDueToday(t)) },
    { key: "upcoming", title: "Upcoming", accent: "text-foreground/70", dot: "bg-blue-500", tasks: tasks.filter(t => t.status === "open" && !isOverdue(t) && !isDueToday(t) && t.due_at) },
    { key: "nodue", title: "No Due Date", accent: "text-muted-foreground", dot: "bg-zinc-400", tasks: tasks.filter(t => t.status === "open" && !t.due_at) },
    { key: "closed", title: "Completed", accent: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500", tasks: tasks.filter(t => t.status === "closed"), collapsed: true },
  ].filter(g => g.tasks.length > 0);

  return (
    <div className="space-y-4">
      {/* Inline create */}
      <div className="flex gap-2 items-center px-1">
        <Input placeholder="New task..." value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={handleKeyDown} className="h-8 text-xs flex-1" />
        {!caseId && caseOptions && (
          <select className="h-8 bg-input border border-border rounded-lg px-2 text-xs text-foreground w-32" value={newCaseId} onChange={e => setNewCaseId(e.target.value)}>
            <option value="">Case...</option>
            {caseOptions.map(c => <option key={c.id} value={c.id}>#{c.case_number}</option>)}
          </select>
        )}
        <Input type="datetime-local" value={newDue} onChange={e => setNewDue(e.target.value)} className="h-8 text-xs w-40" />
        <Button size="sm" className="h-8 text-xs" onClick={create} disabled={!newTitle || (!caseId && !newCaseId)}>Add</Button>
      </div>

      {/* Grouped tasks */}
      {groups.map(g => (
        <TaskGroupView key={g.key} group={g} onToggle={toggle} onCaseClick={id => router.push(`/cases/${id}`)} showCase={!caseId} />
      ))}

      {tasks.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-6">No tasks</p>
      )}
    </div>
  );
}

function TaskGroupView({ group, onToggle, onCaseClick, showCase }: {
  group: TaskGroup;
  onToggle: (id: string, status: string) => void;
  onCaseClick: (caseId: string) => void;
  showCase: boolean;
}) {
  const [collapsed, setCollapsed] = useState(!!group.collapsed);

  return (
    <section>
      <button className="flex items-center gap-2 mb-1.5 w-full" onClick={() => setCollapsed(!collapsed)}>
        <span className={`w-2 h-2 rounded-full ${group.dot}`} />
        <span className={`text-[11px] font-bold uppercase tracking-wider ${group.accent}`}>{group.title}</span>
        <span className="text-[10px] text-muted-foreground">({group.tasks.length})</span>
        <svg className={`w-3 h-3 text-muted-foreground/40 mr-auto transition-transform ${collapsed ? "" : "rotate-180"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {!collapsed && (
        <div className="rounded-lg border border-border/30 overflow-hidden divide-y divide-border/20">
          {group.tasks.map(t => {
            const overdue = isOverdue(t);
            return (
              <div key={t.id} className={`flex items-center gap-3 px-3 py-2 hover:bg-muted/20 transition-colors ${overdue ? "bg-red-500/[0.03]" : ""}`}>
                <button
                  className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
                    t.status === "closed" ? "bg-emerald-500 border-emerald-500 text-white" : overdue ? "border-red-400 hover:border-red-500" : "border-border hover:border-primary"
                  }`}
                  onClick={() => onToggle(t.id, t.status)}>
                  {t.status === "closed" && (
                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                <span className={`text-xs font-medium flex-1 truncate ${t.status === "closed" ? "line-through text-muted-foreground" : ""}`}>{t.title}</span>
                {showCase && t.cases && (
                  <button className="text-[10px] text-primary hover:underline font-mono shrink-0" onClick={() => onCaseClick(t.case_id)}>
                    #{t.cases.case_number}
                  </button>
                )}
                <div className="text-left shrink-0 w-28">
                  {t.due_at && (
                    <p className={`text-[10px] ${overdue ? "text-red-600 dark:text-red-400 font-bold" : "text-muted-foreground"}`}>
                      {fmtDate(t.due_at)}{overdue ? " !" : ""}
                    </p>
                  )}
                  {t.scheduled_at && <p className="text-[10px] text-muted-foreground">{fmtDate(t.scheduled_at)}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
