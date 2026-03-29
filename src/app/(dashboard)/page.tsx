"use client";
import { useEffect, useState, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { DEMO_USER_ID } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "next/navigation";

type Case = {
  id: string; title: string | null; summary: string | null; status: string;
  urgency: string; importance: number; message_count: number;
  last_message_at: string | null; created_at: string; next_scan_at: string | null;
  case_entities: Array<{ role: string; entities: { canonical_name: string; type: string; status: string } | null }>;
};

const STATUS_C: Record<string, string> = {
  pending: "bg-zinc-600", open: "bg-blue-600", action_needed: "bg-red-600", in_progress: "bg-yellow-600",
  addressed: "bg-green-600", scheduled: "bg-purple-600", escalated: "bg-red-700",
};
const URG_C: Record<string, string> = { immediate: "bg-red-600", soon: "bg-orange-500", normal: "bg-blue-500", low: "bg-zinc-600" };

function ImportanceBar({ level }: { level: number }) {
  return (
    <div className="flex gap-0.5 items-center" title={`${level}/10`}>
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className={`w-2 h-3 rounded-sm ${i < level ? (level >= 8 ? "bg-red-500" : level >= 5 ? "bg-yellow-500" : "bg-blue-500") : "bg-zinc-800"}`} />
      ))}
      <span className="text-xs text-zinc-500 mr-1">{level}</span>
    </div>
  );
}

export default function CasesBoard() {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const router = useRouter();

  const load = useCallback(async () => {
    const url = `/api/cases?user_id=${DEMO_USER_ID}${filter ? `&status=${filter}` : ""}&sort_by=importance`;
    const data = await (await fetch(url)).json();
    if (Array.isArray(data)) setCases(data);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    load();
    const sb = createBrowserClient();
    const ch = sb.channel("board").on("postgres_changes", { event: "*", schema: "public", table: "cases" }, () => load()).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [load]);

  async function act(caseId: string, action: string) {
    const endpoint = action === "close" ? `/api/cases/${caseId}/close` : `/api/cases/${caseId}/status`;
    const body = action === "close"
      ? { user_id: DEMO_USER_ID, reason: "Closed from board" }
      : { user_id: DEMO_USER_ID, status: action, reason: `Set ${action} from board` };
    await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    load();
  }

  if (loading) return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-28 bg-zinc-900 rounded-lg animate-pulse" />)}</div>;
  if (!cases.length) return (
    <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
      <p className="text-4xl mb-4">✅</p><p className="text-lg">הכל תחת שליטה</p><p className="text-sm">אין cases פתוחים</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-bold">Cases ({cases.length})</h2>
        <select className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">All open</option>
          <option value="pending">Pending scan</option>
          <option value="action_needed,escalated">Action needed</option>
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="scheduled">Scheduled</option>
          <option value="closed">Closed</option>
        </select>
      </div>
      {cases.map(c => (
        <Card key={c.id} className="bg-zinc-900 border-zinc-800 hover:border-zinc-600 cursor-pointer" onClick={() => router.push(`/cases/${c.id}`)}>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={`${STATUS_C[c.status] || "bg-zinc-600"} text-white`}>{c.status}</Badge>
              <Badge className={`${URG_C[c.urgency] || "bg-zinc-600"} text-white text-xs`}>{c.urgency}</Badge>
              <span className="text-xs text-zinc-500">{c.message_count} msgs</span>
              <span className="text-xs text-zinc-600 mr-auto">{c.last_message_at ? new Date(c.last_message_at).toLocaleString("he-IL") : ""}</span>
              {c.status === "pending" && <Badge variant="outline" className="text-yellow-400 border-yellow-600 text-xs">awaiting scan</Badge>}
            </div>
            <CardTitle className="text-base mt-1">{c.title || `Case ${c.id.slice(0, 8)}`}</CardTitle>
          </CardHeader>
          <CardContent>
            {c.summary && <p className="text-xs text-zinc-400 mb-2">{c.summary}</p>}
            <div className="flex items-center gap-3 mb-3">
              <ImportanceBar level={c.importance} />
              {c.case_entities?.filter(ce => ce.entities?.status === "active").map((ce, i) => (
                <Badge key={i} variant="secondary" className="text-xs">{ce.entities?.canonical_name}</Badge>
              ))}
            </div>
            <div className="flex gap-2" onClick={e => e.stopPropagation()}>
              <Button size="sm" variant="outline" onClick={() => act(c.id, "addressed")}>Addressed</Button>
              <Button size="sm" variant="ghost" className="text-zinc-400" onClick={() => act(c.id, "scheduled")}>Schedule</Button>
              <Button size="sm" variant="ghost" className="text-red-400" onClick={() => act(c.id, "close")}>Close</Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
