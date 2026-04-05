"use client";
import { Fragment, useEffect, useState, useCallback, useMemo } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useRouter } from "next/navigation";

// ── Types ──────────────────────────────────────────────────────────────────
type Signal = {
  id: string;
  gate_id: string;
  case_id: string | null;
  raw_payload: {
    content?: string; sender_name?: string; gate_type?: string;
    phone?: string; direction?: "incoming" | "outgoing";
    is_group?: boolean; chat_name?: string; media_type?: string | null;
  };
  sender_identifier: string;
  channel_identifier: string;
  status: "pending" | "processed" | "ignored";
  processing_decision: { reasoning?: string; action?: string; case_id?: string } | null;
  occurred_at: string;
  received_at: string;
  gates: { type: string; display_name: string } | null;
  cases: { case_number: number; title: string } | null;
};

type Conversation = {
  key: string;
  label: string;
  isGroup: boolean;
  gateName: string;
  gateType: string;
  signals: Signal[];
  lastActivity: string;
  pendingCount: number;
  hasCase: boolean;
};

type SortMode = "newest" | "oldest" | "most-active" | "most-pending";
type StatusTab = "" | "pending" | "processed" | "ignored";

// ── Helpers ────────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { dot: string; label: string; border: string }> = {
  pending:   { dot: "bg-amber-500", label: "Pending",   border: "border-l-amber-500" },
  processed: { dot: "bg-emerald-500", label: "Processed", border: "border-l-emerald-500" },
  ignored:   { dot: "bg-zinc-400", label: "Ignored",   border: "border-l-zinc-400" },
};

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.round(d / 7)}w`;
}

function initials(name: string) {
  return name.replace(/[^a-zA-Z\u0590-\u05FF ]/g, "").split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
}

function conversationKey(s: Signal): string {
  const p = s.raw_payload;
  if (p.is_group && (p.chat_name || s.channel_identifier)) {
    return `grp:${s.gate_id}:${p.chat_name || s.channel_identifier}`;
  }
  const other = p.direction === "outgoing"
    ? (p.chat_name || s.channel_identifier || s.sender_identifier)
    : s.sender_identifier;
  return `dm:${s.gate_id}:${other}`;
}

function conversationLabel(s: Signal): string {
  const p = s.raw_payload;
  if (p.is_group) return p.chat_name || s.channel_identifier || "Group";
  if (p.direction === "outgoing") return p.chat_name || s.channel_identifier || "Unknown";
  const name = String(p.sender_name || s.sender_identifier || "Unknown");
  return name.replace(/\s*\(\d{13,}\)/, "").replace(/\d{13,}@.*$/, "").trim() || name;
}

function groupSignals(signals: Signal[]): Conversation[] {
  const map = new Map<string, Conversation>();
  for (const s of signals) {
    const key = conversationKey(s);
    let conv = map.get(key);
    if (!conv) {
      conv = {
        key,
        label: conversationLabel(s),
        isGroup: !!s.raw_payload.is_group,
        gateName: s.gates?.display_name || s.gates?.type || "unknown",
        gateType: s.gates?.type || s.raw_payload.gate_type || "",
        signals: [],
        lastActivity: s.occurred_at,
        pendingCount: 0,
        hasCase: false,
      };
      map.set(key, conv);
    }
    conv.signals.push(s);
    if (s.status === "pending") conv.pendingCount++;
    if (s.case_id) conv.hasCase = true;
    if (new Date(s.occurred_at) > new Date(conv.lastActivity)) conv.lastActivity = s.occurred_at;
  }
  return Array.from(map.values());
}

function sortConversations(convs: Conversation[], mode: SortMode): Conversation[] {
  const sorted = [...convs];
  switch (mode) {
    case "newest": return sorted.sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());
    case "oldest": return sorted.sort((a, b) => new Date(a.lastActivity).getTime() - new Date(b.lastActivity).getTime());
    case "most-active": return sorted.sort((a, b) => b.signals.length - a.signals.length);
    case "most-pending": return sorted.sort((a, b) => b.pendingCount - a.pendingCount || new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());
    default: return sorted;
  }
}

// ── Components ─────────────────────────────────────────────────────────────

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-lg px-4 py-2 min-w-[80px] ${accent || "bg-muted/50"}`}>
      <span className="text-lg font-bold tabular-nums">{value}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}

function SignalDetails({ signal }: { signal: Signal }) {
  const p = signal.raw_payload;
  const rows: [string, string][] = [
    ["Direction", p.direction || "—"],
    ["Sender", String(p.sender_name || "—")],
    ["Phone", p.phone || "—"],
    ["Channel", signal.channel_identifier || "—"],
    ["Sender ID", signal.sender_identifier || "—"],
    ["Chat", String((p as Record<string, unknown>).chat_name || "—")],
    ["Chat ID", String((p as Record<string, unknown>).chat_id || "—")],
    ["Type", p.is_group ? "Group" : (p as Record<string, unknown>).is_status ? "Status" : "Private"],
    ["Gate", String(p.gate_type || "—")],
    ["Media", p.media_type || "—"],
    ["Status", signal.status],
    ["Occurred", new Date(signal.occurred_at).toLocaleString()],
    ["Received", new Date(signal.received_at).toLocaleString()],
  ];
  return (
    <div className="mt-1.5 rounded-lg bg-muted/60 border border-border/50 px-3 py-2 text-[11px] grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
      {rows.map(([k, v]) => (
        <Fragment key={k}>
          <span className="text-muted-foreground/70 font-medium">{k}</span>
          <span className="text-foreground/80 truncate" title={v}>{v}</span>
        </Fragment>
      ))}
    </div>
  );
}

function MessageBubble({ signal, isLast }: { signal: Signal; isLast: boolean }) {
  const p = signal.raw_payload;
  const isMe = p.direction === "outgoing";
  const st = STATUS_CONFIG[signal.status] || STATUS_CONFIG.pending;
  const router = useRouter();
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className={`flex gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
      <div className={`max-w-[85%] space-y-1 ${isMe ? "items-end" : ""}`}>
        {!isMe && p.sender_name && (
          <span className="text-[11px] font-medium text-muted-foreground/80 ml-1">{p.sender_name}</span>
        )}
        <div className={`rounded-xl px-3 py-2 text-sm border-l-2 ${st.border} ${isMe ? "bg-primary/5 dark:bg-primary/10 ml-auto" : "bg-muted/40"}`}>
          <p className="whitespace-pre-wrap break-words text-foreground/90 leading-relaxed">{p.content || "(no content)"}</p>
          {p.media_type && (
            <span className="inline-block mt-1 text-[10px] bg-muted rounded px-1.5 py-0.5 text-muted-foreground">
              {p.media_type}
            </span>
          )}
        </div>
        <div className={`flex items-center gap-2 px-1 ${isMe ? "justify-end" : ""}`}>
          <span className="text-[10px] text-muted-foreground/60">{timeAgo(signal.occurred_at)}</span>
          <span className={`size-1.5 rounded-full ${st.dot}`} title={st.label} />
          <button
            onClick={() => setShowDetails(!showDetails)}
            className={`text-[10px] font-medium transition-colors ${showDetails ? "text-primary" : "text-muted-foreground/50 hover:text-muted-foreground"}`}
            title="Signal details"
          >
            info
          </button>
          {signal.cases && (
            <button
              className="text-[10px] text-primary hover:underline font-medium"
              onClick={() => router.push(`/cases/${signal.case_id}`)}
            >
              #{signal.cases.case_number}
            </button>
          )}
        </div>
        {showDetails && <SignalDetails signal={signal} />}
        {signal.processing_decision?.reasoning && isLast && (
          <div className="mt-1 rounded-lg bg-violet-50 dark:bg-violet-500/10 border border-violet-200/50 dark:border-violet-500/20 px-3 py-2 text-xs text-violet-700 dark:text-violet-300">
            <span className="font-medium">AI:</span> {signal.processing_decision.reasoning}
          </div>
        )}
      </div>
    </div>
  );
}

function ConversationRow({ conv, isOpen, onToggle }: { conv: Conversation; isOpen: boolean; onToggle: () => void }) {
  const lastSignal = conv.signals[0];
  const lastContent = lastSignal?.raw_payload.content || "";
  const preview = lastContent.length > 80 ? lastContent.slice(0, 80) + "..." : lastContent;
  const gateIcon = conv.gateType === "whatsapp" ? "WA" : conv.gateType === "telegram" ? "TG" : conv.gateType === "email" ? "EM" : "CH";

  return (
    <div className={`rounded-xl border transition-all ${isOpen ? "border-primary/30 bg-card shadow-sm" : "border-border/40 bg-card/50 hover:border-border hover:bg-card"}`}>
      {/* Conversation header row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        {/* Avatar */}
        <div className="relative">
          <Avatar size="default">
            <AvatarFallback className={conv.isGroup ? "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300" : "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300"}>
              {conv.isGroup ? "G" : initials(conv.label)}
            </AvatarFallback>
          </Avatar>
          {conv.pendingCount > 0 && (
            <span className="absolute -top-1 -right-1 size-4 flex items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white ring-2 ring-card">
              {conv.pendingCount > 9 ? "9+" : conv.pendingCount}
            </span>
          )}
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground truncate">{conv.label}</span>
            {conv.isGroup && (
              <Badge className="text-[9px] px-1.5 py-0 bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400 border-0">
                Group
              </Badge>
            )}
            <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">{gateIcon}</span>
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{preview || "(no content)"}</p>
        </div>

        {/* Right side meta */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-[11px] text-muted-foreground/70 tabular-nums">{timeAgo(conv.lastActivity)}</span>
          <div className="flex items-center gap-1.5">
            {conv.signals.length > 1 && (
              <span className="text-[10px] text-muted-foreground/50 tabular-nums">{conv.signals.length} msgs</span>
            )}
            {conv.hasCase && (
              <span className="size-1.5 rounded-full bg-primary" title="Has linked case" />
            )}
          </div>
        </div>

        {/* Expand chevron */}
        <svg className={`size-4 text-muted-foreground/40 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded thread view */}
      {isOpen && (
        <div className="border-t border-border/30 px-4 py-3">
          {/* Conversation metadata */}
          <div className="flex items-center gap-3 mb-3 text-[11px] text-muted-foreground/70">
            <span>{conv.gateName}</span>
            <span className="text-border">|</span>
            <span>{conv.signals.length} message{conv.signals.length !== 1 ? "s" : ""}</span>
            <span className="text-border">|</span>
            <span>{conv.pendingCount} pending</span>
            {conv.hasCase && (
              <>
                <span className="text-border">|</span>
                <span className="text-primary">linked to case</span>
              </>
            )}
          </div>

          {/* Messages thread — chronological (oldest first) */}
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
            {[...conv.signals].reverse().map((s, i) => (
              <MessageBubble key={s.id} signal={s} isLast={i === conv.signals.length - 1} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function SignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusTab, setStatusTab] = useState<StatusTab>("");
  const [gateFilter, setGateFilter] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [openConv, setOpenConv] = useState<string | null>(null);
  const [gates, setGates] = useState<Array<{ id: string; type: string; display_name: string }>>([]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusTab) params.set("status", statusTab);
      if (gateFilter) params.set("gate_id", gateFilter);
      if (search) params.set("search", search);
      params.set("limit", "200");
      const res = await fetch(`/api/signals?${params}`);
      if (!res.ok) { setError(`API error: ${res.status}`); return; }
      const data = await res.json();
      setSignals(data.signals || []);
      setTotal(data.total || 0);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [statusTab, gateFilter, search]);

  useEffect(() => {
    load();
    fetch("/api/gates").then(r => r.json()).then(data => {
      if (Array.isArray(data)) setGates(data);
      else if (data?.data && Array.isArray(data.data)) setGates(data.data);
    }).catch(() => {});

    const interval = setInterval(load, 15000);
    const sb = createBrowserClient();
    const ch = sb.channel("signals-page").on("postgres_changes", { event: "*", schema: "public", table: "signals" }, () => load()).subscribe();
    return () => { sb.removeChannel(ch); clearInterval(interval); };
  }, [load]);

  const counts = useMemo(() => ({
    all: total,
    pending: signals.filter(s => s.status === "pending").length,
    processed: signals.filter(s => s.status === "processed").length,
    ignored: signals.filter(s => s.status === "ignored").length,
    last24h: signals.filter(s => Date.now() - new Date(s.occurred_at).getTime() < 86400000).length,
  }), [signals, total]);

  const conversations = useMemo(() => {
    const grouped = groupSignals(signals);
    return sortConversations(grouped, sortMode);
  }, [signals, sortMode]);

  // ── Render ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-16 rounded-xl bg-muted/30" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <div className="inline-flex items-center justify-center size-12 rounded-full bg-destructive/10 mb-3">
          <svg className="size-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-lg font-medium text-foreground">Failed to load signals</p>
        <p className="text-sm text-muted-foreground mt-1">{error}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => { setError(null); setLoading(true); load(); }}>
          Retry
        </Button>
      </div>
    );
  }

  const tabs: { key: StatusTab; label: string; count: number }[] = [
    { key: "", label: "All", count: counts.all },
    { key: "pending", label: "Pending", count: counts.pending },
    { key: "processed", label: "Processed", count: counts.processed },
    { key: "ignored", label: "Ignored", count: counts.ignored },
  ];

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Signals</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {conversations.length} conversation{conversations.length !== 1 ? "s" : ""} · {counts.last24h} new today
            <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-emerald-500">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              live
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatCard label="Pending" value={counts.pending} accent="bg-amber-50 dark:bg-amber-500/10" />
          <StatCard label="Today" value={counts.last24h} accent="bg-blue-50 dark:bg-blue-500/10" />
        </div>
      </div>

      {/* ── Status Tabs ── */}
      <div className="flex items-center gap-1 border-b border-border/50 pb-px">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setStatusTab(tab.key); setLoading(true); }}
            className={`relative px-3 py-2 text-sm font-medium transition-colors ${
              statusTab === tab.key
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground/80"
            }`}
          >
            {tab.label}
            <span className={`ml-1.5 text-xs tabular-nums ${statusTab === tab.key ? "text-foreground/70" : "text-muted-foreground/50"}`}>
              {tab.count}
            </span>
            {statusTab === tab.key && (
              <span className="absolute bottom-0 inset-x-1 h-0.5 bg-foreground rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* ── Filters Bar ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <Input
            placeholder="Search messages, senders, phones..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <select
          className="h-9 bg-card border border-border rounded-lg px-3 text-sm text-foreground"
          value={gateFilter}
          onChange={e => { setGateFilter(e.target.value); setLoading(true); }}
        >
          <option value="">All gates</option>
          {gates.map(g => <option key={g.id} value={g.id}>{g.display_name}</option>)}
        </select>
        <select
          className="h-9 bg-card border border-border rounded-lg px-3 text-sm text-foreground"
          value={sortMode}
          onChange={e => setSortMode(e.target.value as SortMode)}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="most-active">Most active</option>
          <option value="most-pending">Most pending</option>
        </select>
      </div>

      {/* ── Empty State ── */}
      {conversations.length === 0 && (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center size-12 rounded-full bg-muted/50 mb-3">
            <svg className="size-6 text-muted-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
            </svg>
          </div>
          <p className="text-base font-medium text-foreground/80">No signals yet</p>
          <p className="text-sm text-muted-foreground mt-1">Messages will appear here as they flow through your gates</p>
        </div>
      )}

      {/* ── Conversation List ── */}
      <div className="space-y-2">
        {conversations.map(conv => (
          <ConversationRow
            key={conv.key}
            conv={conv}
            isOpen={openConv === conv.key}
            onToggle={() => setOpenConv(openConv === conv.key ? null : conv.key)}
          />
        ))}
      </div>
    </div>
  );
}
