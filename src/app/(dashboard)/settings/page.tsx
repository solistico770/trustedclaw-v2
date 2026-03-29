"use client";
import { useEffect, useState, useCallback } from "react";
import { DEMO_USER_ID } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Gate = { id: string; type: string; display_name: string; status: string; created_at: string };
type Channel = { id: string; name: string; description: string | null; gate_id: string | null; external_id: string | null; gates?: { type: string; display_name: string } };
type Entity = { id: string; type: string; canonical_name: string; status: string; phone?: string; email?: string; whatsapp_number?: string; telegram_handle?: string; website?: string; external_id?: string; created_at: string };

const TABS = [
  { key: "prompt", label: "Context Prompt" },
  { key: "gates", label: "Gates" },
  { key: "channels", label: "Channels" },
  { key: "entities", label: "Entities" },
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
      {tab === "gates" && <GatesTab />}
      {tab === "channels" && <ChannelsTab />}
      {tab === "entities" && <EntitiesTab />}
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

// ─── GATES TAB ───
function GatesTab() {
  const [gates, setGates] = useState<Gate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState("whatsapp");
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    const db = (await import("@/lib/supabase-browser")).createBrowserClient();
    const { data } = await db.from("gates").select("*").eq("user_id", DEMO_USER_ID).order("created_at");
    if (data) setGates(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!name.trim()) return;
    const db = (await import("@/lib/supabase-server")).createServiceClient();
    await db.from("gates").insert({ user_id: DEMO_USER_ID, type, display_name: name, status: "active" });
    setName(""); setShowForm(false); load();
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Connection points to communication platforms</p>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>{showForm ? "Cancel" : "Add Gate"}</Button>
      </div>
      {showForm && (
        <Card className="border-primary/30">
          <CardContent className="p-4 flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Name</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="My WhatsApp" className="h-9 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Type</label>
              <select className="h-9 bg-input border border-border rounded-lg px-3 text-sm" value={type} onChange={e => setType(e.target.value)}>
                {["whatsapp","telegram","email","slack","phone","webhook","simulator","generic"].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <Button onClick={create} disabled={!name.trim()} className="bg-primary h-9">Create</Button>
          </CardContent>
        </Card>
      )}
      {loading ? <div className="h-16 bg-card rounded-xl animate-pulse" /> :
        gates.length === 0 ? <p className="text-muted-foreground text-sm text-center py-8">No gates yet</p> :
        gates.map(g => (
          <Card key={g.id} className="border-border/50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 dark:bg-primary/15 flex items-center justify-center text-primary text-xs font-bold">{g.type.slice(0,2).toUpperCase()}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{g.display_name}</span>
                  <Badge variant="secondary" className="text-[10px]">{g.type}</Badge>
                  <Badge variant="outline" className={`text-[10px] ${g.status === "active" ? "text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-500/30" : "text-red-600 dark:text-red-400"}`}>{g.status}</Badge>
                </div>
                <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{g.id.slice(0, 8)}</p>
              </div>
            </CardContent>
          </Card>
        ))}
    </div>
  );
}

// ─── CHANNELS TAB ───
function ChannelsTab() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [gates, setGates] = useState<Gate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [gateId, setGateId] = useState("");

  const load = useCallback(async () => {
    const [chRes, gRes] = await Promise.all([
      fetch(`/api/channels?user_id=${DEMO_USER_ID}`).then(r => r.json()),
      import("@/lib/supabase-browser").then(m => m.createBrowserClient().from("gates").select("*").eq("user_id", DEMO_USER_ID)),
    ]);
    if (Array.isArray(chRes)) setChannels(chRes);
    if (gRes.data) setGates(gRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!name.trim()) return;
    await fetch("/api/channels", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: DEMO_USER_ID, name, description: desc || null, gate_id: gateId || null }),
    });
    setName(""); setDesc(""); setGateId(""); setShowForm(false); load();
  }

  async function remove(id: string) {
    await fetch(`/api/channels/${id}`, { method: "DELETE" }); load();
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Communication channels. AI assigns cases to channels.</p>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>{showForm ? "Cancel" : "Add Channel"}</Button>
      </div>
      {showForm && (
        <Card className="border-primary/30">
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Name *</label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Project Alpha" className="h-9 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Gate</label>
                <select className="w-full h-9 bg-input border border-border rounded-lg px-3 text-sm" value={gateId} onChange={e => setGateId(e.target.value)}>
                  <option value="">None</option>
                  {gates.map(g => <option key={g.id} value={g.id}>{g.display_name} ({g.type})</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
              <Input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Optional" className="h-9 text-sm" />
            </div>
            <Button onClick={create} disabled={!name.trim()} className="bg-primary">Create</Button>
          </CardContent>
        </Card>
      )}
      {loading ? <div className="h-16 bg-card rounded-xl animate-pulse" /> :
        channels.length === 0 ? <p className="text-muted-foreground text-sm text-center py-8">No channels yet</p> :
        channels.map(ch => (
          <Card key={ch.id} className="border-border/50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 dark:bg-primary/15 flex items-center justify-center text-primary text-sm font-bold">{ch.name[0]}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{ch.name}</span>
                  {ch.gates && <Badge variant="secondary" className="text-[10px]">{ch.gates.type}</Badge>}
                </div>
                {ch.description && <p className="text-[11px] text-muted-foreground mt-0.5">{ch.description}</p>}
              </div>
              <Button size="sm" variant="ghost" className="h-7 text-[11px] text-destructive" onClick={() => remove(ch.id)}>Remove</Button>
            </CardContent>
          </Card>
        ))}
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
