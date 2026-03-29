"use client";
import { useEffect, useState, useCallback } from "react";
import { DEMO_USER_ID } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type ScanLog = { id: string; triggered_by: string; run_at: string; cases_scanned: number; cases_merged: number; duration_ms: number; status: string; error_message: string | null };

export default function ScanMonitorPage() {
  const [logs, setLogs] = useState<ScanLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    const data = await (await fetch(`/api/scan-logs?user_id=${DEMO_USER_ID}`)).json();
    if (Array.isArray(data)) setLogs(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function runScan() {
    setRunning(true);
    await fetch("/api/agent/scan", {
      method: "POST", headers: { "Content-Type": "application/json", "x-cron-secret": "tcv2-scan-secret-2026", "x-triggered-by": "manual" },
    });
    await load(); setRunning(false);
  }

  const latest = logs[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agent Scanner</h1>
          <p className="text-sm text-muted-foreground mt-1">The AI agent scans pending cases every 5 minutes</p>
        </div>
        <Button onClick={runScan} disabled={running} className="bg-primary">
          {running ? "Scanning..." : "Run Scan Now"}
        </Button>
      </div>

      {/* Status */}
      <Card className={`border-border/50 ${latest?.status === "success" ? "bg-emerald-500/5" : latest ? "bg-red-500/5" : ""}`}>
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-3 h-3 rounded-full ${latest?.status === "success" ? "bg-emerald-400" : latest ? "bg-red-400" : "bg-muted-foreground"}`} />
            <span className="font-medium">{latest ? `Last scan: ${new Date(latest.run_at).toLocaleString("he-IL")}` : "No scans yet"}</span>
          </div>
          {latest && (
            <div className="grid grid-cols-3 gap-6">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Cases Scanned</p>
                <p className="text-2xl font-bold mt-1">{latest.cases_scanned}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Merged</p>
                <p className="text-2xl font-bold mt-1">{latest.cases_merged}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Duration</p>
                <p className="text-2xl font-bold mt-1">{(latest.duration_ms / 1000).toFixed(1)}s</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* History */}
      <div className="rounded-xl border border-border/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-card text-muted-foreground text-right">
              <th className="p-3 font-medium text-xs">Time</th>
              <th className="p-3 font-medium text-xs">Source</th>
              <th className="p-3 font-medium text-xs">Cases</th>
              <th className="p-3 font-medium text-xs">Merged</th>
              <th className="p-3 font-medium text-xs">Duration</th>
              <th className="p-3 font-medium text-xs">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Loading...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No scan history</td></tr>
            ) : logs.map(l => (
              <tr key={l.id} className="border-t border-border/30 hover:bg-card/50 transition-colors">
                <td className="p-3 text-xs font-mono">{new Date(l.run_at).toLocaleString("he-IL")}</td>
                <td className="p-3"><Badge variant="secondary" className="text-[10px]">{l.triggered_by}</Badge></td>
                <td className="p-3">{l.cases_scanned}</td>
                <td className="p-3">{l.cases_merged}</td>
                <td className="p-3 text-xs font-mono">{l.duration_ms}ms</td>
                <td className="p-3">
                  <Badge variant="outline" className={`text-[10px] border ${
                    l.status === "success" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-red-500/15 text-red-400 border-red-500/30"
                  }`}>{l.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
