"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useEC2Query } from "@/lib/use-ec2-query";

/* ── Types ── */
type DbStats = {
  ok: boolean;
  messages_total: number;
  messages_today: number;
  conversations_total: number;
  oldest_message: string | null;
  newest_message: string | null;
  gate_breakdown: Record<string, number>;
  direction_breakdown: Record<string, number>;
  ingest_breakdown: Record<string, number>;
};

type DbQueryResult = {
  ok: boolean;
  table: string;
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  per_page: number;
  page_count: number;
  error?: string;
};

type DbRowResult = {
  ok: boolean;
  row: Record<string, unknown>;
  error?: string;
};

type GateMeta = { last_heartbeat?: string; wa_status?: string };
type Gate = { id: string; metadata: GateMeta };

type Tab = "messages" | "conversations" | "pending_ingest" | "config";

/* ── Helpers ── */
function ago(ts: string | null | undefined) {
  if (!ts) return "—";
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

function truncate(s: unknown, len = 80) {
  const str = String(s || "");
  return str.length > len ? str.slice(0, len) + "..." : str;
}

/* ── Skeleton Row ── */
function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-10 bg-muted/30 rounded-lg animate-pulse" />
      ))}
    </div>
  );
}

/* ── Pagination ── */
function Pagination({
  page, pageCount, perPage, total, onPageChange, onPerPageChange,
}: {
  page: number; pageCount: number; perPage: number; total: number;
  onPageChange: (p: number) => void; onPerPageChange: (pp: number) => void;
}) {
  return (
    <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
      <div className="flex items-center gap-2">
        <span>{total.toLocaleString()} rows</span>
        <select
          value={perPage}
          onChange={e => onPerPageChange(parseInt(e.target.value))}
          className="bg-muted/50 border border-border/30 rounded px-1.5 py-0.5 text-[11px]"
        >
          {[25, 50, 100, 200].map(n => (
            <option key={n} value={n}>{n}/page</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Prev
        </Button>
        <span className="px-2 tabular-nums">{page} / {pageCount || 1}</span>
        <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

/* ── Detail Drawer (inline expand) ── */
function RowDetail({ data, onClose }: { data: Record<string, unknown>; onClose: () => void }) {
  return (
    <div className="bg-card border border-border/40 rounded-xl p-4 space-y-2 mb-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Full Row Data</span>
        <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={onClose}>Close</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
        {Object.entries(data).map(([key, value]) => (
          <div key={key} className="flex gap-2 text-[11px] py-1 border-b border-border/10">
            <span className="font-mono font-medium text-muted-foreground shrink-0 w-40 truncate">{key}</span>
            <span className="font-mono text-foreground break-all min-w-0">
              {typeof value === "object" && value !== null
                ? <pre className="bg-muted/30 rounded p-1 text-[10px] max-h-32 overflow-auto whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</pre>
                : String(value ?? "null")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main Page ── */
export default function EC2DatabasePage() {
  const [tab, setTab] = useState<Tab>("messages");
  const [ec2Online, setEc2Online] = useState<boolean | null>(null);

  // Stats
  const statsQuery = useEC2Query<DbStats>();
  const [stats, setStats] = useState<DbStats | null>(null);

  // Table query
  const tableQuery = useEC2Query<DbQueryResult>();
  const [tableData, setTableData] = useState<DbQueryResult | null>(null);

  // Row detail
  const rowQuery = useEC2Query<DbRowResult>();
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [expandedRowData, setExpandedRowData] = useState<Record<string, unknown> | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [bridge, setBridge] = useState<string>("");
  const [direction, setDirection] = useState<string>("");
  const [ingestStatus, setIngestStatus] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [sortBy, setSortBy] = useState("message_timestamp");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Check EC2 online status from gates
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/wa-control");
        if (res.ok) {
          const data = await res.json();
          const gates = data.gates as Gate[];
          if (gates.length === 0) { setEc2Online(null); return; }
          const latestHb = gates
            .map(g => g.metadata?.last_heartbeat)
            .filter(Boolean)
            .sort()
            .pop();
          if (latestHb) {
            const mins = (Date.now() - new Date(latestHb).getTime()) / 60000;
            setEc2Online(mins < 10);
          }
        }
      } catch {}
    })();
  }, []);

  // Load stats on mount and every 30s
  const loadStats = useCallback(async () => {
    const result = await statsQuery.execute("stats");
    if (result?.ok) setStats(result);
  }, [statsQuery.execute]);

  useEffect(() => {
    loadStats();
    const iv = setInterval(loadStats, 30000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build filter params
  const filterParams = useMemo(() => {
    const filters: Record<string, string> = {};
    if (search) filters.search = search;
    if (bridge) filters.bridge = bridge;
    if (direction) filters.direction = direction;
    if (ingestStatus) filters.ingest_status = ingestStatus;
    if (dateFrom) filters.date_from = new Date(dateFrom).toISOString();
    if (dateTo) filters.date_to = new Date(dateTo + "T23:59:59").toISOString();
    return filters;
  }, [search, bridge, direction, ingestStatus, dateFrom, dateTo]);

  // Load table data
  const loadTable = useCallback(async (overrides?: { tab?: Tab; page?: number; perPage?: number; sortBy?: string; sortDir?: string }) => {
    const t = overrides?.tab ?? tab;
    const p = overrides?.page ?? page;
    const pp = overrides?.perPage ?? perPage;
    const sb = overrides?.sortBy ?? sortBy;
    const sd = overrides?.sortDir ?? sortDir;

    const result = await tableQuery.execute("query", {
      table: t === "messages" ? "raw_messages" : t,
      page: p,
      per_page: pp,
      sort_by: sb,
      sort_dir: sd,
      filters: t === "messages" ? filterParams : {},
    });
    if (result?.ok) setTableData(result);
  }, [tab, page, perPage, sortBy, sortDir, filterParams, tableQuery.execute]);

  // Reload on tab/page/sort changes
  useEffect(() => {
    loadTable();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page, perPage, sortBy, sortDir]);

  // Debounced search reload
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      if (tab === "messages") {
        setPage(1);
        loadTable({ page: 1 });
      }
    }, 500);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Filter change reload
  useEffect(() => {
    if (tab === "messages") {
      setPage(1);
      loadTable({ page: 1 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge, direction, ingestStatus, dateFrom, dateTo]);

  // Expand row detail
  async function expandRow(id: string, table: string) {
    if (expandedRowId === id) { setExpandedRowId(null); setExpandedRowData(null); return; }
    setExpandedRowId(id);
    setExpandedRowData(null);
    const result = await rowQuery.execute("get_row", { table, id });
    if (result?.ok) setExpandedRowData(result.row);
  }

  // Switch to messages tab filtered by chat
  function filterByChat(chatId: string) {
    setTab("messages");
    setSearch("");
    setBridge("");
    setDirection("");
    setIngestStatus("");
    setPage(1);
    // We'll use chat_id filter — but our current filterParams uses search for text.
    // For now just set search to the chat name for quick filtering
    // A dedicated chat_id filter would need extending filterParams
    setExpandedRowId(null);
    setExpandedRowData(null);
  }

  function toggleSort(col: string) {
    if (sortBy === col) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortBy(col);
      setSortDir("desc");
    }
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: "messages", label: "Messages" },
    { key: "conversations", label: "Conversations" },
    { key: "pending_ingest", label: "Pending Ingest" },
    { key: "config", label: "Config" },
  ];

  const rows = tableData?.rows || [];
  const isLoading = tableQuery.loading;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">EC2 Database</h1>
            {ec2Online === true && <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold text-white bg-emerald-500">ONLINE</span>}
            {ec2Online === false && <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold text-white bg-red-500">OFFLINE</span>}
            {ec2Online === null && <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold text-muted-foreground bg-muted">NO GATES</span>}
          </div>
          <p className="text-xs text-muted-foreground">Browse the EC2 ClawListener&apos;s local PostgreSQL</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={loadStats} disabled={statsQuery.loading}>
            {statsQuery.loading ? "Loading..." : "Refresh Stats"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => loadTable()}>
            {isLoading ? "Querying..." : "Refresh"}
          </Button>
        </div>
      </div>

      {/* EC2 Offline banner */}
      {ec2Online === false && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-600 dark:text-red-400">
          EC2 listener appears offline (no heartbeat in 10+ minutes). Queries will likely time out.
        </div>
      )}

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Total Messages", value: stats?.messages_total?.toLocaleString() ?? "—" },
          { label: "Today", value: stats?.messages_today?.toLocaleString() ?? "—" },
          { label: "Conversations", value: stats?.conversations_total?.toLocaleString() ?? "—" },
          { label: "Pending Forward", value: stats?.ingest_breakdown?.pending?.toLocaleString() ?? "0" },
          { label: "Latest Message", value: ago(stats?.newest_message) },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-3">
              <p className="text-lg font-bold tabular-nums">{s.value}</p>
              <p className="text-[10px] text-muted-foreground font-medium">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Gate/direction breakdown */}
      {stats && (
        <div className="flex gap-4 text-[11px] text-muted-foreground">
          {stats.gate_breakdown && Object.entries(stats.gate_breakdown).map(([k, v]) => (
            <span key={k}><span className="font-medium text-foreground">{k}</span>: {v.toLocaleString()}</span>
          ))}
          <span className="border-r border-border/30" />
          {stats.direction_breakdown && Object.entries(stats.direction_breakdown).map(([k, v]) => (
            <span key={k}><span className="font-medium text-foreground">{k}</span>: {v.toLocaleString()}</span>
          ))}
        </div>
      )}

      {/* Error display */}
      {(tableQuery.error || statsQuery.error) && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-600 dark:text-red-400 flex items-center justify-between">
          <span>{tableQuery.error || statsQuery.error}</span>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => loadTable()}>Retry</Button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-card rounded-xl p-1">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setPage(1); setExpandedRowId(null); setExpandedRowData(null); setSortBy(t.key === "messages" ? "message_timestamp" : "created_at"); setSortDir("desc"); }}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
              tab === t.key ? "bg-primary/15 text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Messages filters */}
      {tab === "messages" && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 max-w-xs min-w-[180px]">
            <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <Input
              placeholder="Full-text search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 text-xs pr-9"
            />
          </div>

          {/* Bridge filter */}
          {["", "whatsapp", "telegram"].map(b => (
            <button
              key={b || "all"}
              onClick={() => setBridge(b)}
              className={`text-[11px] font-medium px-2.5 py-1 rounded-lg transition-all ${
                bridge === b ? "bg-primary/10 text-primary ring-1 ring-current/20" : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              {b || "All"}
            </button>
          ))}

          <span className="border-r border-border/30 h-5" />

          {/* Direction filter */}
          {["", "incoming", "outgoing"].map(d => (
            <button
              key={d || "both"}
              onClick={() => setDirection(d)}
              className={`text-[11px] font-medium px-2.5 py-1 rounded-lg transition-all ${
                direction === d ? "bg-primary/10 text-primary ring-1 ring-current/20" : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              {d || "Both"}
            </button>
          ))}

          <span className="border-r border-border/30 h-5" />

          {/* Ingest status */}
          {["", "ingested", "pending"].map(s => (
            <button
              key={s || "any"}
              onClick={() => setIngestStatus(s)}
              className={`text-[11px] font-medium px-2.5 py-1 rounded-lg transition-all ${
                ingestStatus === s ? "bg-primary/10 text-primary ring-1 ring-current/20" : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              {s ? (s === "ingested" ? "Forwarded" : "Pending") : "Any"}
            </button>
          ))}

          <span className="border-r border-border/30 h-5" />

          {/* Date range */}
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 text-[11px] w-32" />
          <span className="text-[10px] text-muted-foreground">to</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 text-[11px] w-32" />

          {/* Clear all */}
          {(search || bridge || direction || ingestStatus || dateFrom || dateTo) && (
            <button
              onClick={() => { setSearch(""); setBridge(""); setDirection(""); setIngestStatus(""); setDateFrom(""); setDateTo(""); }}
              className="text-[10px] text-primary hover:underline"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Loading bar */}
      {isLoading && (
        <div className="h-0.5 bg-primary/20 rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full animate-pulse w-1/3" />
        </div>
      )}

      {/* Table content */}
      <div className={`transition-opacity ${isLoading && tableData ? "opacity-60" : ""}`}>
        {isLoading && !tableData ? (
          <SkeletonRows count={perPage > 25 ? 10 : 5} />
        ) : (
          <>
            {/* Messages table */}
            {tab === "messages" && (
              <div className="space-y-1">
                {/* Sort header */}
                <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  {[
                    { key: "message_timestamp", label: "Time", w: "w-24" },
                    { key: "bridge", label: "Bridge", w: "w-16" },
                    { key: "sender_name", label: "Sender", w: "w-28" },
                    { key: "chat_name", label: "Chat", w: "w-32" },
                    { key: "", label: "Content", w: "flex-1" },
                  ].map(col => (
                    <button
                      key={col.key || "content"}
                      onClick={() => col.key && toggleSort(col.key)}
                      className={`${col.w} text-right ${col.key ? "cursor-pointer hover:text-foreground" : "cursor-default"}`}
                    >
                      {col.label}
                      {sortBy === col.key && <span className="mr-0.5">{sortDir === "asc" ? " ↑" : " ↓"}</span>}
                    </button>
                  ))}
                  <span className="w-20 text-right">Status</span>
                </div>

                {rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-6 text-center">No messages found</p>
                ) : (
                  <div className="rounded-xl border border-border/40 overflow-hidden divide-y divide-border/20">
                    {rows.map((row) => {
                      const id = String(row.id);
                      const isExpanded = expandedRowId === id;
                      return (
                        <div key={id}>
                          <div
                            onClick={() => expandRow(id, "raw_messages")}
                            className="flex items-center gap-2 px-3 py-[var(--space-row,8px)] hover:bg-muted/20 transition-colors cursor-pointer text-xs"
                          >
                            <span className="w-24 text-[11px] text-muted-foreground tabular-nums shrink-0">{ago(row.message_timestamp as string)}</span>
                            <Badge variant="outline" className={`w-16 justify-center text-[9px] ${row.bridge === "whatsapp" ? "text-emerald-600 border-emerald-300" : "text-blue-600 border-blue-300"}`}>
                              {row.bridge as string}
                            </Badge>
                            <span className="w-28 truncate font-medium shrink-0">
                              {row.is_outgoing as boolean && <span className="text-[9px] text-blue-500 mr-1">OUT</span>}
                              {row.sender_name as string || "—"}
                            </span>
                            <span className="w-32 truncate text-muted-foreground shrink-0">{row.chat_name as string || "—"}</span>
                            <span className="flex-1 truncate text-muted-foreground">{truncate(row.content, 60)}</span>
                            <span className="w-20 text-right shrink-0">
                              {row.forwarded_at ? (
                                <span className="text-[9px] text-emerald-600">forwarded</span>
                              ) : (
                                <span className="text-[9px] text-amber-600">pending</span>
                              )}
                            </span>
                          </div>
                          {isExpanded && expandedRowData && <RowDetail data={expandedRowData} onClose={() => { setExpandedRowId(null); setExpandedRowData(null); }} />}
                          {isExpanded && !expandedRowData && rowQuery.loading && (
                            <div className="p-4 text-xs text-muted-foreground animate-pulse">Loading full row...</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Conversations table */}
            {tab === "conversations" && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  <span className="w-48">Chat Name</span>
                  <span className="w-16">Bridge</span>
                  <span className="w-20 text-right">Messages</span>
                  <span className="w-28 text-right">Last Message</span>
                  <span className="flex-1" />
                </div>
                {rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-6 text-center">No conversations found</p>
                ) : (
                  <div className="rounded-xl border border-border/40 overflow-hidden divide-y divide-border/20">
                    {rows.map((row) => {
                      const id = String(row.id);
                      const isExpanded = expandedRowId === id;
                      return (
                        <div key={id}>
                          <div
                            onClick={() => expandRow(id, "conversations")}
                            className="flex items-center gap-2 px-3 py-[var(--space-row,8px)] hover:bg-muted/20 transition-colors cursor-pointer text-xs"
                          >
                            <span className="w-48 font-medium truncate">{row.chat_name as string || row.chat_id as string}</span>
                            <Badge variant="outline" className="w-16 justify-center text-[9px]">{row.gate_type as string || row.bridge as string || "—"}</Badge>
                            <span className="w-20 text-right tabular-nums font-medium">{String(row.message_count ?? "—")}</span>
                            <span className="w-28 text-right text-muted-foreground">{ago(row.last_message_at as string)}</span>
                            <span className="flex-1" />
                          </div>
                          {isExpanded && expandedRowData && <RowDetail data={expandedRowData} onClose={() => { setExpandedRowId(null); setExpandedRowData(null); }} />}
                          {isExpanded && !expandedRowData && rowQuery.loading && (
                            <div className="p-4 text-xs text-muted-foreground animate-pulse">Loading...</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Pending Ingest table */}
            {tab === "pending_ingest" && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  <span className="w-24">ID</span>
                  <span className="w-24">Message ID</span>
                  <span className="w-16 text-center">Status</span>
                  <span className="w-16 text-center">Attempts</span>
                  <span className="flex-1">Last Error</span>
                  <span className="w-28 text-right">Next Retry</span>
                </div>
                {rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-6 text-center">No pending ingestion records</p>
                ) : (
                  <div className="rounded-xl border border-border/40 overflow-hidden divide-y divide-border/20">
                    {rows.map((row) => {
                      const id = String(row.id);
                      const isExpanded = expandedRowId === id;
                      return (
                        <div key={id}>
                          <div
                            onClick={() => expandRow(id, "pending_ingest")}
                            className="flex items-center gap-2 px-3 py-[var(--space-row,8px)] hover:bg-muted/20 transition-colors cursor-pointer text-xs"
                          >
                            <span className="w-24 font-mono text-[10px] truncate">{id.slice(0, 8)}</span>
                            <span className="w-24 font-mono text-[10px] truncate">{String(row.message_id || "").slice(0, 8)}</span>
                            <span className="w-16 text-center">
                              <Badge variant="outline" className={`text-[9px] ${row.status === "failed" ? "text-red-500 border-red-300" : "text-amber-600 border-amber-300"}`}>
                                {row.status as string}
                              </Badge>
                            </span>
                            <span className="w-16 text-center tabular-nums">{String(row.attempt_count ?? 0)}</span>
                            <span className="flex-1 truncate text-muted-foreground">{truncate(row.last_error, 60)}</span>
                            <span className="w-28 text-right text-muted-foreground">{ago(row.next_retry_at as string)}</span>
                          </div>
                          {isExpanded && expandedRowData && <RowDetail data={expandedRowData} onClose={() => { setExpandedRowId(null); setExpandedRowData(null); }} />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Config table */}
            {tab === "config" && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  <span className="w-48">Key</span>
                  <span className="flex-1">Value</span>
                  <span className="w-28 text-right">Updated</span>
                </div>
                {rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-6 text-center">No config entries</p>
                ) : (
                  <div className="rounded-xl border border-border/40 overflow-hidden divide-y divide-border/20">
                    {rows.map((row) => (
                      <div key={String(row.key)} className="flex items-center gap-2 px-3 py-[var(--space-row,8px)] text-xs">
                        <span className="w-48 font-mono font-medium">{row.key as string}</span>
                        <span className="flex-1 font-mono text-muted-foreground truncate">{truncate(row.value, 100)}</span>
                        <span className="w-28 text-right text-muted-foreground">{ago(row.updated_at as string)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Pagination */}
            {tableData && tableData.page_count > 0 && (
              <Pagination
                page={tableData.page}
                pageCount={tableData.page_count}
                perPage={perPage}
                total={tableData.total}
                onPageChange={setPage}
                onPerPageChange={(pp) => { setPerPage(pp); setPage(1); }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
