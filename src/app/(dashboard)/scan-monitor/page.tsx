"use client";
import { useEffect, useState, useCallback } from "react";
import { DEMO_USER_ID } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
    await load();
    setRunning(false);
  }

  const latest = logs[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-bold">Scan Monitor</h2>
        <Button onClick={runScan} disabled={running} size="sm">{running ? "Running..." : "Run Scan Now"}</Button>
      </div>
      <Card className={`border ${latest?.status === "success" ? "border-green-800 bg-green-950/20" : latest ? "border-red-800 bg-red-950/20" : "border-zinc-800 bg-zinc-900"}`}>
        <CardHeader><CardTitle className="flex items-center gap-2">
          <span className={`w-3 h-3 rounded-full ${latest?.status === "success" ? "bg-green-500" : latest ? "bg-red-500" : "bg-zinc-500"}`} />
          {latest ? `Last scan: ${new Date(latest.run_at).toLocaleString("he-IL")}` : "No scans yet"}
        </CardTitle></CardHeader>
        {latest && <CardContent className="grid grid-cols-3 gap-4 text-sm">
          <div><p className="text-zinc-500">Cases scanned</p><p>{latest.cases_scanned}</p></div>
          <div><p className="text-zinc-500">Cases merged</p><p>{latest.cases_merged}</p></div>
          <div><p className="text-zinc-500">Duration</p><p>{latest.duration_ms}ms</p></div>
        </CardContent>}
      </Card>
      <div className="rounded-lg border border-zinc-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900"><tr className="text-zinc-500 text-right">
            <th className="p-3">זמן</th><th className="p-3">מקור</th><th className="p-3">cases</th><th className="p-3">merged</th><th className="p-3">ms</th><th className="p-3">סטטוס</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className="p-4 text-center text-zinc-600">Loading...</td></tr> :
              logs.map(l => (
                <tr key={l.id} className="border-t border-zinc-800 hover:bg-zinc-900/50">
                  <td className="p-3 text-xs">{new Date(l.run_at).toLocaleString("he-IL")}</td>
                  <td className="p-3"><Badge variant="outline" className="text-xs">{l.triggered_by}</Badge></td>
                  <td className="p-3">{l.cases_scanned}</td>
                  <td className="p-3">{l.cases_merged}</td>
                  <td className="p-3">{l.duration_ms}</td>
                  <td className="p-3"><Badge className={`${l.status === "success" ? "bg-green-700" : "bg-red-700"} text-white text-xs`}>{l.status}</Badge></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
