"use client";
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Gate = { id: string; type: string; display_name: string; status: string; metadata: Record<string, string>; created_at: string };
type Entity = { id: string; type: string; canonical_name: string; status: string; phone?: string; email?: string; whatsapp_number?: string; telegram_handle?: string; website?: string; external_id?: string; created_at: string };
type Skill = { id: string; name: string; summary: string; instructions: string; auto_attach: boolean; is_active: boolean; created_at: string };
type ApiKey = { id: string; name: string; key_prefix: string; scopes: string[]; last_used_at: string | null; created_at: string; revoked_at: string | null };

const TABS = [
  { key: "gates", label: "Gates" },
  { key: "telegram", label: "Telegram Bot" },
  { key: "prompt", label: "Context Prompt" },
  { key: "skills", label: "Skills" },
  { key: "api-keys", label: "API Keys" },
];

export default function SettingsPage() {
  const [tab, setTab] = useState("gates");

  // Read ?tab= from URL on mount (avoids Suspense requirement for useSearchParams)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    if (t && TABS.some(tab => tab.key === t)) setTab(t);
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      <div className="flex gap-1 bg-card rounded-xl p-1 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              tab === t.key ? "bg-primary/15 text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}>{t.label}</button>
        ))}
      </div>
      {tab === "gates" && <GatesTab />}
      {tab === "telegram" && <TelegramBotTab />}
      {tab === "prompt" && <PromptTab />}
      {tab === "skills" && <SkillsTab />}
      {tab === "api-keys" && <ApiKeysTab />}
    </div>
  );
}

// ─── TELEGRAM BOT TAB ───
function TelegramBotTab() {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState<{
    connected: boolean;
    bot_username?: string;
    bot_name?: string;
    bot_id?: string;
    gate_id?: string;
  } | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/telegram/setup");
      if (res.ok) setStatus(await res.json());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function connect() {
    if (!token.trim()) return;
    setConnecting(true);
    setError("");
    try {
      const res = await fetch("/api/telegram/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bot_token: token }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to connect"); return; }
      setToken("");
      load();
    } catch (e) {
      setError("Network error");
    } finally {
      setConnecting(false);
    }
  }

  async function disconnect() {
    await fetch("/api/telegram/setup", { method: "DELETE" });
    setStatus(null);
    load();
  }

  if (loading) {
    return <div className="space-y-3 animate-pulse"><div className="h-32 rounded-xl bg-card" /><div className="h-20 rounded-xl bg-card" /></div>;
  }

  const isConnected = status?.connected && status.bot_username;
  const botLink = status?.bot_username ? `https://t.me/${status.bot_username}` : "";
  // QR code via Google Charts API — encodes the t.me link
  const qrUrl = botLink ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(botLink)}` : "";

  return (
    <div className="space-y-4 max-w-2xl">
      {isConnected ? (
        <>
          {/* Connected state */}
          <Card className="border-green-500/30 bg-green-500/5">
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                {/* QR Code */}
                {qrUrl && (
                  <div className="shrink-0">
                    <div className="w-[140px] h-[140px] rounded-xl bg-white p-2 shadow-sm">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qrUrl} alt="Telegram QR" width={124} height={124} className="rounded-lg" />
                    </div>
                    <p className="text-[10px] text-muted-foreground text-center mt-1.5">Scan to open bot</p>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-sm font-semibold text-green-600 dark:text-green-400">Connected</span>
                  </div>
                  <h3 className="text-lg font-bold">{status.bot_name}</h3>
                  <p className="text-sm text-muted-foreground">@{status.bot_username}</p>
                  <a href={botLink} target="_blank" rel="noopener noreferrer"
                    className="inline-block mt-2 text-xs text-primary hover:underline">{botLink}</a>

                  <div className="mt-4 p-3 rounded-lg bg-card border border-border">
                    <p className="text-xs font-medium mb-1">Available commands:</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground font-mono">
                      <span>/cases</span><span>List open cases</span>
                      <span>/case 12</span><span>Case details</span>
                      <span>/create Title</span><span>New case</span>
                      <span>/close 12</span><span>Close case</span>
                      <span>/scan 12</span><span>Rescan case</span>
                      <span>/entities</span><span>List entities</span>
                      <span>/tasks</span><span>Open tasks</span>
                      <span>/stats</span><span>Dashboard</span>
                    </div>
                  </div>

                  <Button size="sm" variant="ghost" className="mt-3 text-destructive text-xs" onClick={disconnect}>
                    Disconnect Bot
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          {/* Setup state */}
          <Card>
            <CardContent className="p-5 space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-1">Connect Telegram Bot</h3>
                <p className="text-xs text-muted-foreground">
                  Create a bot with <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">@BotFather</a> on Telegram, then paste the token here.
                </p>
              </div>
              <div className="flex gap-2">
                <Input
                  value={token}
                  onChange={e => setToken(e.target.value)}
                  placeholder="123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw"
                  className="h-9 text-sm font-mono"
                  type="password"
                />
                <Button onClick={connect} disabled={!token.trim() || connecting} className="h-9 px-4">
                  {connecting ? "Connecting..." : "Connect"}
                </Button>
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
            </CardContent>
          </Card>
          <div className="text-xs text-muted-foreground space-y-1 px-1">
            <p><strong>How it works:</strong></p>
            <p>1. The bot registers a webhook to receive messages</p>
            <p>2. You can send commands to manage cases, entities, and tasks</p>
            <p>3. Free text messages are ingested as signals for the agent</p>
            <p>4. A QR code will appear so you can quickly open the bot chat</p>
          </div>
        </>
      )}
    </div>
  );
}

// ─── PROMPT TAB (Identity + Context Prompt) ───
function PromptTab() {
  const [prompt, setPrompt] = useState("");
  const [identity, setIdentity] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/settings/context-prompt`)
      .then(r => r.json()).then(d => {
        setPrompt(d.context_prompt || "");
        setIdentity(d.identity || {});
        setLoading(false);
      });
  }, []);

  async function save() {
    await fetch("/api/settings/context-prompt", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context_prompt: prompt, identity }),
    });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  function setField(key: string, value: string) {
    setIdentity(prev => ({ ...prev, [key]: value }));
  }

  if (loading) return <div className="h-48 bg-card rounded-xl animate-pulse max-w-2xl" />;

  return (
    <div className="space-y-4 max-w-2xl">
      {/* WHO AM I */}
      <Card className="border-border/50">
        <CardContent className="p-5 space-y-3">
          <div>
            <h3 className="text-sm font-semibold mb-1">Who Am I</h3>
            <p className="text-xs text-muted-foreground">Your identity — injected into every AI call so the agent knows who it's working for.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Full Name</label>
              <Input value={identity.name || ""} onChange={e => setField("name", e.target.value)} placeholder="Shay Cohen" className="h-9 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Role / Title</label>
              <Input value={identity.role || ""} onChange={e => setField("role", e.target.value)} placeholder="CEO, Developer, Teacher..." className="h-9 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Business / Organization</label>
              <Input value={identity.business || ""} onChange={e => setField("business", e.target.value)} placeholder="Kadabrix Ltd" className="h-9 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Phone</label>
              <Input value={identity.phone || ""} onChange={e => setField("phone", e.target.value)} placeholder="+972..." className="h-9 text-sm font-mono" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Email</label>
              <Input value={identity.email || ""} onChange={e => setField("email", e.target.value)} placeholder="you@company.com" className="h-9 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">WhatsApp Number</label>
              <Input value={identity.whatsapp || ""} onChange={e => setField("whatsapp", e.target.value)} placeholder="+972..." className="h-9 text-sm font-mono" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">About Me / Notes</label>
            <Textarea value={identity.notes || ""} onChange={e => setField("notes", e.target.value)} placeholder="Anything the AI should know about you..." className="text-sm min-h-[60px]" />
          </div>
        </CardContent>
      </Card>

      {/* CONTEXT PROMPT */}
      <Card className="border-border/50">
        <CardContent className="p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold mb-1">Agent Context Prompt</h3>
            <p className="text-xs text-muted-foreground">Custom instructions for the AI. What to focus on, what to ignore, how to behave.</p>
          </div>
          <Textarea value={prompt} onChange={e => setPrompt(e.target.value)} className="min-h-[200px] font-mono text-[13px]" />
        </CardContent>
      </Card>

      <div className="flex gap-3 items-center">
        <Button onClick={save} className="bg-primary">Save All</Button>
        {saved && <span className="text-sm text-emerald-600 dark:text-emerald-400">Saved!</span>}
      </div>
    </div>
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
    const data = await (await fetch(`/api/skills`)).json();
    if (Array.isArray(data)) setSkills(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!name.trim() || !summary.trim() || !instructions.trim()) return;
    if (editingId) {
      await fetch(`/api/skills/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, summary, instructions, auto_attach: autoAttach }) });
    } else {
      await fetch("/api/skills", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, summary, instructions, auto_attach: autoAttach }) });
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

// ─── GATES TAB (control center for all connections) ───
function GatesTab() {
  const [gates, setGates] = useState<Gate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState("whatsapp");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [connToken, setConnToken] = useState("");
  const [activeQr, setActiveQr] = useState<Record<string, string>>({});
  const [connectingGate, setConnectingGate] = useState<string | null>(null);
  const [gateErrors, setGateErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const data = await (await fetch(`/api/gates`)).json();
    if (Array.isArray(data)) setGates(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Live gate status via Supabase Realtime
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    const supabase = createClient(url, key);
    const channel = supabase.channel("gates-live")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "gates" }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  async function sendCommand(command: string, params: Record<string, string> = {}) {
    const res = await fetch("/api/listener/command", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, params }),
    });
    return res.json();
  }

  async function pollResponse(commandId: string, timeoutMs = 15000): Promise<Record<string, unknown> | null> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const res = await fetch(`/api/listener/response?command_id=${commandId}`);
      const data = await res.json();
      if (data?.data) return data.data as Record<string, unknown>;
      await new Promise(r => setTimeout(r, 1000));
    }
    return null;
  }

  // Create gate — triggers EC2 connection for WA/TG types
  async function create() {
    if (!name.trim()) return;
    const metadata: Record<string, string> = {};
    if (connToken) metadata.token = connToken;
    metadata.description = description;

    const res = await fetch("/api/gates", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, display_name: name, description, metadata }),
    });
    const gate = await res.json();
    setName(""); setDescription(""); setConnToken(""); setShowForm(false);
    await load();

    // Auto-trigger connection for WA/TG gates
    if (gate.id && (type === "whatsapp" || type === "telegram")) {
      await triggerConnect(gate.id, type, metadata.token);
    }
  }

  // Trigger WA QR flow or TG bot connect for a specific gate
  async function triggerConnect(gateId: string, gateType: string, token?: string) {
    setConnectingGate(gateId);
    setGateErrors(prev => ({ ...prev, [gateId]: "" }));

    if (gateType === "whatsapp") {
      const { command_id } = await sendCommand("request_qr", { gate_id: gateId });
      const resp = await pollResponse(command_id, 30000);
      if (resp?.qr_string) {
        setActiveQr(prev => ({ ...prev, [gateId]: resp.qr_string as string }));
        // Poll for connection success
        const poll = setInterval(async () => {
          await load();
        }, 3000);
        setTimeout(() => clearInterval(poll), 120000); // stop after 2min
      } else {
        setGateErrors(prev => ({ ...prev, [gateId]: "Could not generate QR. Is the listener running?" }));
      }
    } else if (gateType === "telegram") {
      if (!token) { setGateErrors(prev => ({ ...prev, [gateId]: "Bot token required" })); setConnectingGate(null); return; }
      const { command_id } = await sendCommand("connect_telegram", { gate_id: gateId, token });
      const resp = await pollResponse(command_id);
      if (resp?.status === "connected") {
        await load();
      } else {
        setGateErrors(prev => ({ ...prev, [gateId]: (resp?.message as string) || "Failed to connect" }));
      }
    }
    setConnectingGate(null);
  }

  async function disconnectGate(gateId: string, gateType: string) {
    const cmd = gateType === "whatsapp" ? "disconnect_whatsapp" : "disconnect_telegram";
    const { command_id } = await sendCommand(cmd, { gate_id: gateId });
    await pollResponse(command_id, 10000);
    setActiveQr(prev => { const n = { ...prev }; delete n[gateId]; return n; });
    await load();
  }

  const [rescanningGate, setRescanningGate] = useState<string | null>(null);
  async function rescanGate(gateId: string, hours: string) {
    setRescanningGate(gateId);
    const { command_id } = await sendCommand("rescan_history", { gate_id: gateId, hours });
    await pollResponse(command_id, 180000);
    setRescanningGate(null);
    await load();
  }

  async function remove(id: string) {
    await fetch(`/api/gates/${id}`, { method: "DELETE" }); load();
  }

  function heartbeatLabel(meta: Record<string, string>) {
    if (!meta.last_heartbeat) return null;
    const mins = Math.floor((Date.now() - new Date(meta.last_heartbeat).getTime()) / 60000);
    if (mins < 10) return { text: "online", cls: "text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-500/30" };
    if (mins < 30) return { text: `seen ${mins}m ago`, cls: "text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-500/30" };
    return { text: "offline", cls: "text-red-600 dark:text-red-400 border-red-300 dark:border-red-500/30" };
  }

  const GATE_ICONS: Record<string, string> = {
    whatsapp: "WA", telegram: "TG", email: "EM", slack: "SL", phone: "PH", webhook: "WH", simulator: "SM", generic: "GN",
  };
  const GATE_COLORS: Record<string, string> = {
    whatsapp: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    telegram: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Gates are your communication channels. Create a WhatsApp or Telegram gate to start capturing messages.</p>
          <p className="text-xs text-muted-foreground mt-0.5">Each gate connects to one account. You can have multiple WhatsApp and Telegram gates.</p>
        </div>
        <Button size="sm" onClick={() => { setShowForm(!showForm); setName(""); setDescription(""); setConnToken(""); }}>{showForm ? "Cancel" : "Add Gate"}</Button>
      </div>

      {showForm && (
        <Card className="border-primary/30">
          <CardContent className="p-5 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Gate Name *</label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Personal WhatsApp" className="h-9 text-sm" />
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
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="My personal WhatsApp, Business bot..." className="h-9 text-sm" />
            </div>
            {(type === "telegram" || type === "slack") && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Bot Token</label>
                <Input value={connToken} onChange={e => setConnToken(e.target.value)} placeholder="bot123:ABC..." className="h-9 text-sm font-mono" type="password" />
                {type === "telegram" && <p className="text-[10px] text-muted-foreground mt-1">Get from @BotFather on Telegram</p>}
              </div>
            )}
            <Button onClick={create} disabled={!name.trim()} className="bg-primary">
              {type === "whatsapp" ? "Create & Connect (QR)" : type === "telegram" ? "Create & Connect Bot" : "Create Gate"}
            </Button>
          </CardContent>
        </Card>
      )}

      {loading ? <div className="h-16 bg-card rounded-xl animate-pulse" /> :
        gates.length === 0 ? <p className="text-muted-foreground text-sm text-center py-8">No gates yet. Add your first connection.</p> :
        gates.map(g => {
          const meta = (g.metadata || {}) as Record<string, string>;
          const isLive = g.type === "whatsapp" || g.type === "telegram";
          const connStatus = meta.wa_status || meta.tg_status;
          const isConnected = connStatus === "connected";
          const hb = heartbeatLabel(meta);
          const qr = activeQr[g.id];
          const error = gateErrors[g.id];
          const isConnecting = connectingGate === g.id;

          return (
            <Card key={g.id} className={`border-border/50 ${isConnected ? "border-emerald-500/30" : ""}`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${GATE_COLORS[g.type] || "bg-primary/10 text-primary"}`}>
                    {GATE_ICONS[g.type] || "??"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-sm">{g.display_name}</span>
                      <Badge variant="secondary" className="text-[10px]">{g.type}</Badge>
                      {isLive && isConnected && <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-500/30">Connected</Badge>}
                      {isLive && !isConnected && connStatus && <Badge variant="outline" className="text-[10px] text-amber-600">{connStatus}</Badge>}
                      {hb && <Badge variant="outline" className={`text-[10px] ${hb.cls}`}>{hb.text}</Badge>}
                    </div>
                    {meta.description && <p className="text-xs text-muted-foreground">{meta.description}</p>}
                    <div className="flex gap-3 mt-1.5 text-[11px] text-muted-foreground flex-wrap">
                      {meta.wa_phone && <span>Phone: <span className="font-mono">{meta.wa_phone}</span></span>}
                      {meta.bot_username && <span>Bot: <span className="font-mono">@{meta.bot_username}</span></span>}
                      {meta.message_count && <span>Messages: {meta.message_count}</span>}
                      {meta.token && <span>Token: <span className="font-mono">****{meta.token.slice(-4)}</span></span>}
                      <span className="font-mono text-[10px] opacity-50">{g.id.slice(0, 8)}</span>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 text-[11px] text-destructive shrink-0" onClick={() => remove(g.id)}>Remove</Button>
                </div>

                {/* QR Code for WhatsApp */}
                {qr && (
                  <div className="flex gap-4 items-start bg-muted/50 rounded-xl p-4">
                    <div className="w-48 h-48 bg-white rounded-xl flex items-center justify-center p-2 shrink-0">
                      <img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qr)}`} alt="QR" className="w-full h-full object-contain" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Scan with WhatsApp</p>
                      <ol className="text-xs text-muted-foreground space-y-1">
                        <li>1. Open WhatsApp on your phone</li>
                        <li>2. Settings &gt; Linked Devices</li>
                        <li>3. Scan this code</li>
                      </ol>
                      <p className="text-[10px] text-muted-foreground">QR refreshes automatically</p>
                    </div>
                  </div>
                )}

                {error && <p className="text-xs text-red-500">{error}</p>}

                {/* Tracking config for WA/TG gates */}
                {isLive && (
                  <div className="flex gap-4 items-center pt-1 border-t border-border/30">
                    <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Track:</span>
                    {[
                      { key: "track_private", label: "Private msgs", defaultVal: true },
                      { key: "track_groups", label: "Group msgs", defaultVal: true },
                      { key: "track_status", label: "Status/Stories", defaultVal: false },
                    ].map(opt => {
                      const raw = meta[opt.key];
                      // Handle both boolean and string values from JSONB
                      const isOn = raw === undefined || raw === null ? opt.defaultVal : String(raw) === "true";
                      return (
                        <label key={opt.key} className="flex items-center gap-1.5 cursor-pointer">
                          <input type="checkbox" checked={isOn} onChange={async () => {
                            const newVal = !isOn;
                            await fetch(`/api/gates/${g.id}`, {
                              method: "PATCH", headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ metadata: { ...meta, [opt.key]: newVal } }),
                            });
                            load();
                          }} className="w-3.5 h-3.5 rounded accent-primary" />
                          <span className="text-[11px] text-muted-foreground">{opt.label}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* Actions for live gates */}
                {isLive && (
                  <div className="flex gap-2 pt-1">
                    {!isConnected && !isConnecting && !qr && (
                      <Button size="sm" variant="outline" className="text-[11px] h-7" onClick={() => triggerConnect(g.id, g.type, meta.token)}>
                        {g.type === "whatsapp" ? "Connect (QR)" : "Connect Bot"}
                      </Button>
                    )}
                    {isConnecting && <Button size="sm" disabled className="text-[11px] h-7">Connecting...</Button>}
                    {isConnected && (
                      <>
                        <Button size="sm" variant="ghost" className="text-[11px] h-7 text-destructive" onClick={() => disconnectGate(g.id, g.type)}>Disconnect</Button>
                        {g.type === "whatsapp" && rescanningGate === g.id && <Button size="sm" disabled className="text-[11px] h-7">Scanning...</Button>}
                        {g.type === "whatsapp" && rescanningGate !== g.id && (
                          <select className="h-7 bg-input border border-border rounded-lg px-2 text-[11px] text-foreground" defaultValue=""
                            onChange={e => { if (e.target.value) { rescanGate(g.id, e.target.value); e.target.value = ""; } }}>
                            <option value="" disabled>Rescan...</option>
                            <option value="1">1 hour</option>
                            <option value="6">6 hours</option>
                            <option value="24">24 hours</option>
                            <option value="72">3 days</option>
                            <option value="168">7 days</option>
                            <option value="720">30 days</option>
                          </select>
                        )}
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
    </div>
  );
}

// ─── API KEYS TAB ───
function ApiKeysTab() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState("");
  const [showNewKey, setShowNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const data = await (await fetch("/api/settings/api-keys")).json();
    if (Array.isArray(data)) setKeys(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function generate() {
    if (!newKeyName.trim()) return;
    const res = await fetch("/api/settings/api-keys", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newKeyName.trim() }),
    });
    const data = await res.json();
    if (data.raw_key) {
      setShowNewKey(data.raw_key);
      setNewKeyName("");
      load();
    }
  }

  async function revoke(id: string) {
    await fetch(`/api/settings/api-keys/${id}`, { method: "DELETE" });
    load();
  }

  function copyKey() {
    if (showNewKey) { navigator.clipboard.writeText(showNewKey); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <p className="text-sm text-muted-foreground">API keys allow external services (like ClawListener) to authenticate with TrustedClaw.</p>
        <p className="text-xs text-muted-foreground mt-0.5">Keys are shown only once when generated. Store them securely.</p>
      </div>

      {/* New key dialog */}
      {showNewKey && (
        <Card className="border-emerald-500/50 bg-emerald-500/5">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">New API Key Generated</span>
            </div>
            <p className="text-xs text-muted-foreground">Copy this key now. It won't be shown again.</p>
            <div className="flex gap-2">
              <Input value={showNewKey} readOnly className="h-9 text-sm font-mono bg-muted" />
              <Button size="sm" onClick={copyKey} className="shrink-0">{copied ? "Copied!" : "Copy"}</Button>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setShowNewKey(null)} className="text-xs">Done</Button>
          </CardContent>
        </Card>
      )}

      {/* Generate form */}
      <Card className="border-border/50">
        <CardContent className="p-4 flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Key Name</label>
            <Input value={newKeyName} onChange={e => setNewKeyName(e.target.value)} placeholder="e.g. EC2 Listener" className="h-9 text-sm"
              onKeyDown={e => e.key === "Enter" && generate()} />
          </div>
          <Button onClick={generate} disabled={!newKeyName.trim()} className="bg-primary h-9">Generate Key</Button>
        </CardContent>
      </Card>

      {/* Key list */}
      {loading ? <div className="h-16 bg-card rounded-xl animate-pulse" /> :
        keys.length === 0 ? <p className="text-muted-foreground text-sm text-center py-8">No API keys yet.</p> :
        keys.map(k => (
          <Card key={k.id} className={`border-border/50 ${k.revoked_at ? "opacity-50" : ""}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center text-xs font-bold shrink-0">
                  {k.revoked_at ? "XX" : "AK"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-semibold text-sm">{k.name}</span>
                    <Badge variant="outline" className={`text-[10px] ${k.revoked_at ? "text-red-500 border-red-300" : "text-emerald-600 border-emerald-300 dark:text-emerald-400 dark:border-emerald-500/30"}`}>
                      {k.revoked_at ? "revoked" : "active"}
                    </Badge>
                  </div>
                  <div className="flex gap-3 text-[11px] text-muted-foreground">
                    <span className="font-mono">{k.key_prefix}...</span>
                    <span>Created {new Date(k.created_at).toLocaleDateString("he-IL")}</span>
                    {k.last_used_at && <span>Last used {new Date(k.last_used_at).toLocaleDateString("he-IL")}</span>}
                  </div>
                </div>
                {!k.revoked_at && (
                  <Button size="sm" variant="ghost" className="h-7 text-[11px] text-destructive shrink-0" onClick={() => revoke(k.id)}>Revoke</Button>
                )}
              </div>
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
    const params = `${statusFilter !== "all" ? `status=${statusFilter}` : ""}${q ? `${statusFilter !== "all" ? "&" : ""}q=${q}` : ""}`;
    const data = await (await fetch(`/api/entities?${params}`)).json();
    setEntities(data?.data || (Array.isArray(data) ? data : []));
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
