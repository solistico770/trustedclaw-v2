"use client";
import { useEffect, useState, useCallback } from "react";
import { DEMO_USER_ID } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type CaseResult = {
  case_id: string; decision: string; reasoning: string;
  commands_count: number; commands_executed: Array<{ type: string; status: string; detail?: string }>;
  skills_pulled: string[]; tokens: number; duration_ms: number; status: string; error?: string;
};

type ScanLog = {
  id: string; triggered_by: string; run_at: string; cases_scanned: number; cases_merged: number;
  duration_ms: number; status: string; error_message: string | null; case_results: CaseResult[] | null;
};

export default function ScanMonitorPage() {
  const [logs, setLogs] = useState<ScanLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await (await fetch(`/api/scan-logs?user_id=${DEMO_USER_ID}`)).json();
    if (Array.isArray(data)) setLogs(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function runScan(scanAll: boolean) {
    setRunning(true);
    await fetch("/api/agent/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-secret": "tcv2-scan-secret-2026", "x-triggered-by": "manual", ...(scanAll ? { "x-scan-all": "true" } : {}) },
    });
    await load(); setRunning(false);
  }

  const latest = logs[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agent Scanner</h1>
          <p className="text-sm text-muted-foreground mt-1">AI scans cases when their next_scan_at arrives</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => runScan(false)} disabled={running} className="bg-primary">{running ? "..." : "Scan Due"}</Button>
          <Button onClick={() => runScan(true)} disabled={running} variant="secondary">{running ? "..." : "Scan All Open"}</Button>
        </div>
      </div>

      {/* Latest status */}
      <Card className={`border-border/50 ${latest?.status === "success" ? "bg-emerald-500/5 dark:bg-emerald-500/5" : latest ? "bg-red-500/5 dark:bg-red-500/5" : ""}`}>
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-3 h-3 rounded-full ${latest?.status === "success" ? "bg-emerald-500" : latest ? "bg-red-500" : "bg-muted-foreground"}`} />
            <span className="font-medium">{latest ? `Last: ${new Date(latest.run_at).toLocaleString("he-IL")}` : "No scans yet"}</span>
          </div>
          {latest && (
            <div className="grid grid-cols-4 gap-6">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Cases</p>
                <p className="text-2xl font-bold mt-1">{latest.cases_scanned}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Merged</p>
                <p className="text-2xl font-bold mt-1">{latest.cases_merged}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Duration</p>
                <p className="text-2xl font-bold mt-1">{(latest.duration_ms / 1000).toFixed(1)}s</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Status</p>
                <p className={`text-2xl font-bold mt-1 ${latest.status === "success" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{latest.status}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scan history */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Scan History</h2>
        {loading ? <div className="h-20 bg-card rounded-xl animate-pulse" /> :
          logs.length === 0 ? <p className="text-muted-foreground text-center py-8">No scans yet</p> :
          logs.map(l => (
            <Card key={l.id} className="border-border/50">
              <CardContent className="p-0">
                {/* Header row */}
                <button className="w-full p-4 flex items-center gap-4 text-right hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedLog(expandedLog === l.id ? null : l.id)}>
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${l.status === "success" ? "bg-emerald-500" : "bg-red-500"}`} />
                  <span className="text-xs font-mono text-muted-foreground w-36 shrink-0">{new Date(l.run_at).toLocaleString("he-IL")}</span>
                  <Badge variant="secondary" className="text-[10px] shrink-0">{l.triggered_by}</Badge>
                  <span className="text-sm font-medium">{l.cases_scanned} cases</span>
                  {l.cases_merged > 0 && <span className="text-xs text-muted-foreground">{l.cases_merged} merged</span>}
                  <span className="text-xs text-muted-foreground">{(l.duration_ms / 1000).toFixed(1)}s</span>
                  <span className="mr-auto text-xs text-muted-foreground">{expandedLog === l.id ? "▲" : "▼"}</span>
                </button>

                {/* Expanded detail */}
                {expandedLog === l.id && l.case_results && (
                  <div className="border-t border-border/50 p-4 space-y-3">
                    {l.case_results.map((cr, i) => (
                      <div key={i} className="bg-muted/30 rounded-lg p-3 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono text-muted-foreground">{cr.case_id.slice(0, 8)}</span>
                          <Badge className={`text-[10px] ${cr.status === "success" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400" : "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400"}`}>{cr.status}</Badge>
                          <Badge variant="secondary" className="text-[10px]">{cr.decision}</Badge>
                          <span className="text-xs text-muted-foreground">{cr.tokens} tokens · {cr.duration_ms}ms</span>
                        </div>
                        <p className="text-xs text-foreground/80">{cr.reasoning}</p>

                        {/* Commands executed */}
                        {cr.commands_executed.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">API Commands Executed</p>
                            {cr.commands_executed.map((cmd, j) => (
                              <div key={j} className="flex items-center gap-2 text-xs">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cmd.status === "ok" || cmd.status === "linked_existing" || cmd.status === "created" ? "bg-emerald-500" : "bg-red-500"}`} />
                                <span className="font-mono text-foreground/70">{cmd.type}</span>
                                <span className="text-muted-foreground">{cmd.status}</span>
                                {cmd.detail && <span className="text-muted-foreground truncate">{cmd.detail}</span>}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Skills pulled */}
                        {cr.skills_pulled.length > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Skills:</span>
                            {cr.skills_pulled.map((s, j) => <Badge key={j} className="bg-primary/15 text-primary text-[10px]">{s}</Badge>)}
                          </div>
                        )}

                        {cr.error && <p className="text-xs text-red-500 font-mono">{cr.error}</p>}
                      </div>
                    ))}
                  </div>
                )}

                {expandedLog === l.id && !l.case_results && (
                  <div className="border-t border-border/50 p-4">
                    <p className="text-xs text-muted-foreground">No detailed results (older scan)</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
      </div>
    </div>
  );
}
