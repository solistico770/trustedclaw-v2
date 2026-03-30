"use client";
import { useEffect, useState, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";

type Task = {
  id: string;
  case_id: string;
  title: string;
  description: string | null;
  status: "open" | "closed";
  scheduled_at: string | null;
  due_at: string | null;
  closed_at: string | null;
  created_at: string;
  cases: { case_number: number; title: string } | null;
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("he-IL", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function isOverdue(task: Task) {
  return task.status === "open" && task.due_at && new Date(task.due_at) < new Date();
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("open");
  const [dueFilter, setDueFilter] = useState("");
  const [scheduledFilter, setScheduledFilter] = useState("");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [cases, setCases] = useState<Array<{ id: string; case_number: number; title: string }>>([]);
  const [newTask, setNewTask] = useState({ case_id: "", title: "", description: "", scheduled_at: "", due_at: "" });
  const router = useRouter();

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (dueFilter) params.set("due", dueFilter);
    if (scheduledFilter) params.set("scheduled", scheduledFilter);
    if (search) params.set("search", search);
    const data = await fetch(`/api/tasks?${params}`).then(r => r.json());
    setTasks(data?.data || (Array.isArray(data) ? data : []));
    setLoading(false);
  }, [statusFilter, dueFilter, scheduledFilter, search]);

  useEffect(() => {
    load();
    // Load cases for create form
    fetch("/api/cases").then(r => r.json()).then(data => {
      const arr = data?.data || (Array.isArray(data) ? data : []);
      setCases(arr.map((c: { id: string; case_number: number; title: string }) => ({ id: c.id, case_number: c.case_number, title: c.title })));
    });
    const sb = createBrowserClient();
    const ch = sb.channel("tasks-page").on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => load()).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [load]);

  async function toggleTask(taskId: string, currentStatus: string) {
    const endpoint = currentStatus === "open" ? `/api/tasks/${taskId}/close` : `/api/tasks/${taskId}/open`;
    await fetch(endpoint, { method: "POST" });
    load();
  }

  async function createTask() {
    if (!newTask.case_id || !newTask.title) return;
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        case_id: newTask.case_id,
        title: newTask.title,
        description: newTask.description || undefined,
        scheduled_at: newTask.scheduled_at || undefined,
        due_at: newTask.due_at || undefined,
      }),
    });
    setNewTask({ case_id: "", title: "", description: "", scheduled_at: "", due_at: "" });
    setShowCreate(false);
    load();
  }

  if (loading) return <div className="space-y-3 animate-pulse">{[1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-card" />)}</div>;

  const overdue = tasks.filter(t => isOverdue(t)).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Tasks</h1>
          <p className="text-sm text-muted-foreground">{tasks.length} tasks{overdue > 0 ? ` · ${overdue} overdue` : ""}</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? "Cancel" : "Create Task"}
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <Card className="border-primary/30">
          <CardContent className="p-4 space-y-3">
            <select className="w-full h-9 bg-input border border-border rounded-lg px-3 text-sm text-foreground" value={newTask.case_id} onChange={e => setNewTask(p => ({ ...p, case_id: e.target.value }))}>
              <option value="">Select case...</option>
              {cases.map(c => <option key={c.id} value={c.id}>#{c.case_number} {c.title || "(untitled)"}</option>)}
            </select>
            <Input placeholder="Task title" value={newTask.title} onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))} className="h-9 text-sm" />
            <Input placeholder="Description (optional)" value={newTask.description} onChange={e => setNewTask(p => ({ ...p, description: e.target.value }))} className="h-9 text-sm" />
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Scheduled</label>
                <Input type="datetime-local" value={newTask.scheduled_at} onChange={e => setNewTask(p => ({ ...p, scheduled_at: e.target.value }))} className="h-9 text-sm" />
              </div>
              <div className="flex-1">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Due</label>
                <Input type="datetime-local" value={newTask.due_at} onChange={e => setNewTask(p => ({ ...p, due_at: e.target.value }))} className="h-9 text-sm" />
              </div>
            </div>
            <Button size="sm" onClick={createTask} disabled={!newTask.case_id || !newTask.title}>Create</Button>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Input placeholder="Search title..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs h-9 text-sm" />
        <select className="h-9 bg-input border border-border rounded-lg px-3 text-sm text-foreground" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
        <select className="h-9 bg-input border border-border rounded-lg px-3 text-sm text-foreground" value={dueFilter} onChange={e => setDueFilter(e.target.value)}>
          <option value="">All Due Dates</option>
          <option value="overdue">Overdue</option>
          <option value="today">Today</option>
          <option value="this_week">This Week</option>
          <option value="no_date">No Due Date</option>
        </select>
        <select className="h-9 bg-input border border-border rounded-lg px-3 text-sm text-foreground" value={scheduledFilter} onChange={e => setScheduledFilter(e.target.value)}>
          <option value="">All Scheduled</option>
          <option value="past">Past</option>
          <option value="today">Today</option>
          <option value="upcoming">Upcoming</option>
          <option value="unscheduled">Unscheduled</option>
        </select>
      </div>

      {tasks.length === 0 && (
        <div className="text-center py-12">
          <p className="text-lg font-medium text-foreground/80">No tasks</p>
          <p className="text-sm text-muted-foreground mt-1">Tasks will appear as the AI creates them or you add them manually</p>
        </div>
      )}

      {/* Task list */}
      <div className="space-y-2">
        {tasks.map(t => {
          const overdue = isOverdue(t);
          return (
            <Card key={t.id} className={`border-border/50 hover:border-primary/40 transition-all ${overdue ? "border-red-300 dark:border-red-500/30" : ""}`}>
              <CardContent className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <button
                    className={`w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
                      t.status === "closed"
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-border hover:border-primary"
                    }`}
                    onClick={() => toggleTask(t.id, t.status)}
                  >
                    {t.status === "closed" && (
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${t.status === "closed" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                        {t.title}
                      </span>
                    </div>
                    {t.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{t.description}</p>}
                  </div>
                  {t.cases && (
                    <button
                      className="text-xs text-primary hover:underline shrink-0"
                      onClick={() => router.push(`/cases/${t.case_id}`)}
                    >
                      #{t.cases.case_number}
                    </button>
                  )}
                  <div className="text-left shrink-0 w-32">
                    {t.scheduled_at && (
                      <p className="text-[10px] text-muted-foreground">Sched: {fmtDate(t.scheduled_at)}</p>
                    )}
                    {t.due_at && (
                      <p className={`text-[10px] ${overdue ? "text-red-600 dark:text-red-400 font-semibold" : "text-muted-foreground"}`}>
                        Due: {fmtDate(t.due_at)}{overdue ? " OVERDUE" : ""}
                      </p>
                    )}
                    {!t.scheduled_at && !t.due_at && (
                      <p className="text-[10px] text-muted-foreground">No dates</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
