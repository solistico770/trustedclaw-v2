"use client";
import { useEffect, useState, useCallback } from "react";
import { DEMO_USER_ID } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Gate = { id: string; type: string; display_name: string; status: string; metadata: Record<string, string>; created_at: string };
// Channel type removed — deprecated
type Entity = { id: string; type: string; canonical_name: string; status: string; phone?: string; email?: string; whatsapp_number?: string; telegram_handle?: string; website?: string; external_id?: string; created_at: string };

type Skill = { id: string; name: string; summary: string; instructions: string; auto_attach: boolean; is_active: boolean; created_at: string };

const TABS = [
  { key: "prompt", label: "Context Prompt" },
  { key: "skills", label: "Skills" },
  { key: "gates", label: "Gates" },
];

export default function SettingsPage() {
  const [tab, setTab] = useState("prompt");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      <div className="flex gap-1 bg-card rounded-xl p-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
              tab === t.key ? "bg-primary/15 text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}>{t.label}</button>
        ))}
      </div>
      {tab === "prompt" && <PromptTab />}
      {tab === "skills" && <SkillsTab />}
      {tab === "gates" && <GatesTab />}
    </div>
  );
}

// ─── PROMPT TAB ───
function PromptTab() {
  const [prompt, setPrompt] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/settings/context-prompt?user_id=${DEMO_USER_ID}`)
      .then(r => r.json()).then(d => { setPrompt(d.context_prompt || ""); setLoading(false); });
  }, []);

  async function save() {
    await fetch("/api/settings/context-prompt", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: DEMO_USER_ID, context_prompt: prompt }),
    });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  return (
    <Card className="border-border/50 max-w-2xl">
      <CardContent className="p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold mb-1">Agent Context Prompt</h3>
          <p className="text-xs text-muted-foreground">Injected at the start of every AI scan. Tell the agent who you are, what matters, what to ignore.</p>
        </div>
        {loading ? <div className="h-48 bg-muted rounded-lg animate-pulse" /> :
          <Textarea value={prompt} onChange={e => setPrompt(e.target.value)} className="min-h-[240px] font-mono text-[13px]" />}
        <div className="flex gap-3 items-center">
          <Button onClick={save} className="bg-primary">Save</Button>
          {saved && <span className="text-sm text-emerald-600 dark:text-emerald-400">Saved!</span>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── SKILLS TAB ───
function SkillsTab() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [instructions, setInstructions] = useState("");
  const [autoAttach, setAutoAttach] = useState(false);

  const load = useCallback(async () => {
    const data = await (await fetch(`/api/skills?user_id=${DEMO_USER_ID}`)).json();
    if (Array.isArray(data)) setSkills(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!name.trim() || !summary.trim() || !instructions.trim()) return;
    if (editingId) {
      await fetch(`/api/skills/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, summary, instructions, auto_attach: autoAttach }) });
    } else {
      await fetch("/api/skills", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: DEMO_USER_ID, name, summary, instructions, auto_attach: autoAttach }) });
    }
    resetForm(); load();
  }

  async function remove(id: string) {
    await fetch(`/api/skills/${id}`, { method: "DELETE" }); load();
  }

  async function toggleActive(id: string, current: boolean) {
    await fetch(`/api/skills/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_active: !current }) }); load();
  }

  function startEdit(s: Skill) {
    setEditingId(s.id); setName(s.name); setSummary(s.summary); setInstructions(s.instructions); setAutoAttach(s.auto_attach); setShowForm(true);
  }

  function resetForm() {
    setEditingId(null); setName(""); setSummary(""); setInstructions(""); setAutoAttach(false); setShowForm(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Skills are context modules the AI can pull on demand.</p>
          <p className="text-xs text-muted-foreground mt-1"><strong>Summary</strong> = always visible to AI (skill map). <strong>Instructions</strong> = hidden until AI pulls it.</p>
        </div>
        <Button size="sm" onClick={() => { resetForm(); setShowForm(!showForm); }}>{showForm ? "Cancel" : "Add Skill"}</Button>
      </div>

      {showForm && (
        <Card className="border-primary/30">
          <CardContent className="p-5 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Skill Name *</label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Customer Service Call" className="h-9 text-sm" />
              </div>
              <div className="flex items-end gap-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={autoAttach} onChange={e => setAutoAttach(e.target.checked)} className="w-4 h-4 rounded accent-primary" />
                  <span>Auto-attach</span>
                </label>
                <p className="text-[10px] text-muted-foreground">Always include full instructions in context</p>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Summary * <span className="text-muted-foreground/60">(visible to AI always — what this skill does)</span></label>
              <Textarea value={summary} onChange={e => setSummary(e.target.value)} placeholder="Handles customer service calls. Use when conversation is about a service request or complaint." className="text-sm min-h-[60px]" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Instructions * <span className="text-muted-foreground/60">(hidden until AI pulls — how to do it)</span></label>
              <Textarea value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Step-by-step instructions for handling this type of case..." className="text-sm min-h-[120px] font-mono" />
            </div>
            <Button onClick={save} disabled={!name.trim() || !summary.trim() || !instructions.trim()} className="bg-primary">
              {editingId ? "Update Skill" : "Create Skill"}
            </Button>
          </CardContent>
        </Card>
      )}

      {loading ? <div className="h-16 bg-card rounded-xl animate-pulse" /> :
        skills.length === 0 ? <p className="text-muted-foreground text-sm text-center py-8">No skills yet. Create your first skill to give the AI specialized knowledge.</p> :
        skills.map(s => (
          <Card key={s.id} className={`border-border/50 ${!s.is_active ? "opacity-50" : ""}`}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${s.auto_attach ? "bg-primary/15 text-primary" : "bg-secondary text-secondary-foreground"}`}>
                  {s.auto_attach ? "A" : "P"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm">{s.name}</span>
                    {s.auto_attach && <Badge className="bg-primary/15 text-primary text-[10px]">auto-attach</Badge>}
                    {!s.is_active && <Badge variant="outline" className="text-[10px] text-muted-foreground">disabled</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{s.summary}</p>
                  <details className="mt-2">
                    <summary className="text-[11px] text-primary cursor-pointer hover:underline">Show instructions</summary>
                    <pre className="mt-1 text-[11px] text-muted-foreground whitespace-pre-wrap bg-muted p-2 rounded-lg">{s.instructions}</pre>
                  </details>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => startEdit(s)}>Edit</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => toggleActive(s.id, s.is_active)}>{s.is_active ? "Disable" : "Enable"}</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-[11px] text-destructive" onClick={() => remove(s.id)}>Delete</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
    </div>
  );
}

// ─── GATES TAB ───
function GatesTab() {
  const [gates, setGates] = useState<Gate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState("whatsapp");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [connPhone, setConnPhone] = useState("");
  const [connToken, setConnToken] = useState("");
  const [connWebhook, setConnWebhook] = useState("");

  const load = useCallback(async () => {
    const data = await (await fetch(`/api/gates?user_id=${DEMO_USER_ID}`)).json();
    if (Array.isArray(data)) setGates(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!name.trim()) return;
    const metadata: Record<string, string> = {};
    if (connPhone) metadata.phone = connPhone;
    if (connToken) metadata.token = connToken;
    if (connWebhook) metadata.webhook_url = connWebhook;

    await fetch("/api/gates", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: DEMO_USER_ID, type, display_name: name, description, metadata }),
    });
    setName(""); setDescription(""); setConnPhone(""); setConnToken(""); setConnWebhook(""); setShowForm(false); load();
  }

  async function remove(id: string) {
    await fetch(`/api/gates/${id}`, { method: "DELETE" }); load();
  }

  const GATE_ICONS: Record<string, string> = {
    whatsapp: "WA", telegram: "TG", email: "EM", slack: "SL", phone: "PH", webhook: "WH", simulator: "SM", generic: "GN",
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Gates are connection points to communication platforms.</p>
          <p className="text-xs text-muted-foreground mt-0.5">Each gate has a name, description, and connection metadata.</p>
        </div>
        <Button size="sm" onClick={() => { setShowForm(!showForm); setName(""); setDescription(""); }}>{showForm ? "Cancel" : "Add Gate"}</Button>
      </div>

      {showForm && (
        <Card className="border-primary/30">
          <CardContent className="p-5 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Gate Name *</label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="My WhatsApp" className="h-9 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Type *</label>
                <select className="w-full h-9 bg-input border border-border rounded-lg px-3 text-sm" value={type} onChange={e => setType(e.target.value)}>
                  {["whatsapp","telegram","email","slack","phone","webhook","simulator","generic"].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Personal WhatsApp, Business Telegram..." className="h-9 text-sm" />
            </div>
            <div className="border-t border-border/50 pt-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Connection Details</p>
              <div className="grid grid-cols-2 gap-3">
                {(type === "whatsapp" || type === "phone") && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Phone Number</label>
                    <Input value={connPhone} onChange={e => setConnPhone(e.target.value)} placeholder="+972..." className="h-9 text-sm font-mono" />
                  </div>
                )}
                {(type === "telegram" || type === "slack") && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Bot Token / API Key</label>
                    <Input value={connToken} onChange={e => setConnToken(e.target.value)} placeholder="bot123:ABC..." className="h-9 text-sm font-mono" type="password" />
                  </div>
                )}
                {type === "webhook" && (
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Webhook URL</label>
                    <Input value={connWebhook} onChange={e => setConnWebhook(e.target.value)} placeholder="https://..." className="h-9 text-sm font-mono" />
                  </div>
                )}
                {type === "email" && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Email Address</label>
                    <Input value={connPhone} onChange={e => setConnPhone(e.target.value)} placeholder="inbox@..." className="h-9 text-sm" />
                  </div>
                )}
              </div>
            </div>
            <Button onClick={create} disabled={!name.trim()} className="bg-primary">Create Gate</Button>
          </CardContent>
        </Card>
      )}

      {loading ? <div className="h-16 bg-card rounded-xl animate-pulse" /> :
        gates.length === 0 ? <p className="text-muted-foreground text-sm text-center py-8">No gates yet. Add your first connection.</p> :
        gates.map(g => {
          const meta = (g.metadata || {}) as Record<string, string>;
          return (
            <Card key={g.id} className="border-border/50">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 dark:bg-primary/15 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                    {GATE_ICONS[g.type] || "??"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-sm">{g.display_name}</span>
                      <Badge variant="secondary" className="text-[10px]">{g.type}</Badge>
                      <Badge variant="outline" className={`text-[10px] ${g.status === "active" ? "text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-500/30" : "text-red-600 dark:text-red-400"}`}>{g.status}</Badge>
                    </div>
                    {meta.description && <p className="text-xs text-muted-foreground">{meta.description}</p>}
                    <div className="flex gap-3 mt-1.5 text-[11px] text-muted-foreground flex-wrap">
                      {meta.phone && <span>Phone: <span className="font-mono">{meta.phone}</span></span>}
                      {meta.token && <span>Token: <span className="font-mono">••••{meta.token.slice(-4)}</span></span>}
                      {meta.webhook_url && <span>Webhook: <span className="font-mono">{meta.webhook_url.slice(0, 30)}...</span></span>}
                      <span className="font-mono text-[10px] opacity-50">{g.id.slice(0, 8)}</span>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 text-[11px] text-destructive shrink-0" onClick={() => remove(g.id)}>Remove</Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
    </div>
  );
}

// ─── ENTITIES TAB ───
function EntitiesTab() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("proposed");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const params = `user_id=${DEMO_USER_ID}${statusFilter !== "all" ? `&status=${statusFilter}` : ""}${q ? `&q=${q}` : ""}`;
    const data = await (await fetch(`/api/entities?${params}`)).json();
    if (Array.isArray(data)) setEntities(data);
    setLoading(false);
  }, [statusFilter, q]);

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  async function approve(id: string) { await fetch(`/api/entities/${id}/approve`, { method: "POST" }); load(); }
  async function reject(id: string) { await fetch(`/api/entities/${id}/reject`, { method: "POST" }); load(); }
  async function batchAction(action: string) {
    if (!selected.size) return;
    await fetch("/api/entities/batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: Array.from(selected), action }) });
    setSelected(new Set()); load();
  }
  function toggle(id: string) { const s = new Set(selected); s.has(id) ? s.delete(id) : s.add(id); setSelected(s); }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">People, companies, projects — proposed by AI, approved by you.</p>
      <div className="flex gap-3 items-center">
        <Input placeholder="Search..." value={q} onChange={e => setQ(e.target.value)} className="max-w-xs h-9 text-sm" />
        <select className="h-9 bg-input border border-border rounded-lg px-3 text-sm" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setSelected(new Set()); }}>
          <option value="proposed">Pending</option>
          <option value="active">Active</option>
          <option value="all">All</option>
        </select>
        {statusFilter === "proposed" && selected.size > 0 && (
          <>
            <Button size="sm" onClick={() => batchAction("approve")} className="bg-emerald-600 hover:bg-emerald-500 h-8">Approve {selected.size}</Button>
            <Button size="sm" variant="destructive" className="h-8" onClick={() => batchAction("reject")}>Reject {selected.size}</Button>
          </>
        )}
      </div>
      {loading ? <div className="h-16 bg-card rounded-xl animate-pulse" /> :
        entities.length === 0 ? <p className="text-muted-foreground text-sm text-center py-8">No entities</p> :
        entities.map(e => (
          <Card key={e.id} className="border-border/50">
            <CardContent className="p-4 flex items-center gap-3">
              {statusFilter === "proposed" && (
                <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} className="w-4 h-4 rounded accent-primary" />
              )}
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold ${
                e.status === "active" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" :
                e.status === "proposed" ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" :
                "bg-muted text-muted-foreground"
              }`}>{e.type.slice(0,2).toUpperCase()}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{e.canonical_name}</span>
                  <Badge variant="secondary" className="text-[10px]">{e.type}</Badge>
                </div>
                <div className="flex gap-3 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
                  {e.phone && <span>Tel: {e.phone}</span>}
                  {e.email && <span>{e.email}</span>}
                  {e.whatsapp_number && <span>WA: {e.whatsapp_number}</span>}
                  {e.telegram_handle && <span>TG: {e.telegram_handle}</span>}
                  {e.website && <span>{e.website}</span>}
                  {!e.phone && !e.email && <span>{new Date(e.created_at).toLocaleDateString("he-IL")}</span>}
                </div>
              </div>
              {e.status === "proposed" && (
                <div className="flex gap-1.5">
                  <Button size="sm" className="h-7 text-[11px] bg-emerald-600 hover:bg-emerald-500" onClick={() => approve(e.id)}>Approve</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-[11px] text-destructive" onClick={() => reject(e.id)}>Reject</Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
    </div>
  );
}
