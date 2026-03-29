"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { DEMO_USER_ID } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STATUS_C: Record<string, string> = {
  pending: "bg-zinc-600", open: "bg-blue-600", action_needed: "bg-red-600", in_progress: "bg-yellow-600",
  addressed: "bg-green-600", scheduled: "bg-purple-600", escalated: "bg-red-700", closed: "bg-zinc-700",
};

export default function CaseDetail() {
  const { id } = useParams<{ id: string }>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [tab, setTab] = useState<"messages" | "agent" | "history">("messages");

  const load = useCallback(async () => {
    const d = await (await fetch(`/api/cases/${id}`)).json();
    setData(d);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function changeStatus(status: string) {
    await fetch(`/api/cases/${id}/status`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: DEMO_USER_ID, status, reason: `Set ${status}` }),
    });
    load();
  }

  async function scanNow() {
    setScanning(true);
    await fetch(`/api/agent/scan/${id}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: DEMO_USER_ID }),
    });
    await load();
    setScanning(false);
  }

  if (loading) return <div className="h-64 bg-zinc-900 rounded animate-pulse" />;
  if (!data?.case) return <p className="text-zinc-500">Case not found.</p>;
  const c = data.case;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <Badge className={`${STATUS_C[c.status]} text-white`}>{c.status}</Badge>
          <Badge variant="outline">{c.urgency}</Badge>
          <Badge variant="outline">Importance: {c.importance}/10</Badge>
          <span className="text-xs text-zinc-500 mr-auto">{c.message_count} messages</span>
        </div>
        <h1 className="text-2xl font-bold">{c.title || `Case ${c.id.slice(0, 8)}`}</h1>
        {c.summary && <p className="text-sm text-zinc-400 mt-1">{c.summary}</p>}
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" onClick={scanNow} disabled={scanning}>{scanning ? "Scanning..." : "Scan Now"}</Button>
        {c.status !== "in_progress" && <Button size="sm" variant="outline" onClick={() => changeStatus("in_progress")}>Start Working</Button>}
        {c.status !== "addressed" && <Button size="sm" variant="outline" onClick={() => changeStatus("addressed")}>Addressed</Button>}
        {c.status !== "closed" && <Button size="sm" variant="ghost" className="text-red-400" onClick={() => changeStatus("closed")}>Close</Button>}
      </div>

      {/* Entities */}
      {data.entities?.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {data.entities.map((ce: { entities: { canonical_name: string; type: string; status: string } | null }, i: number) => (
            <Badge key={i} variant={ce.entities?.status === "active" ? "secondary" : "outline"}
              className={ce.entities?.status === "proposed" ? "border-yellow-600 text-yellow-400" : ""}>
              {ce.entities?.canonical_name} ({ce.entities?.type}) {ce.entities?.status === "proposed" ? "⏳" : ""}
            </Badge>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-4 border-b border-zinc-800 pb-2">
        {(["messages", "agent", "history"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`text-sm pb-1 ${tab === t ? "text-white border-b-2 border-blue-500" : "text-zinc-500"}`}>
            {t === "messages" ? `Messages (${data.messages?.length || 0})` : t === "agent" ? `Agent History (${data.case_events?.length || 0})` : "Audit Log"}
          </button>
        ))}
      </div>

      {/* Messages Tab */}
      {tab === "messages" && (
        <div className="space-y-3 border-r-2 border-zinc-800 pr-4">
          {(data.messages || []).map((m: { id: string; raw_payload: Record<string, string>; sender_identifier: string; occurred_at: string }) => (
            <div key={m.id} className="relative">
              <div className="absolute -right-[9px] top-1 w-4 h-4 rounded-full bg-zinc-700 border-2 border-zinc-900" />
              <Card className="bg-zinc-900 border-zinc-800 mr-4">
                <CardHeader className="py-2 px-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">{new Date(m.occurred_at).toLocaleString("he-IL")}</span>
                    <span className="text-xs text-zinc-400">{m.sender_identifier}</span>
                  </div>
                  <CardTitle className="text-sm mt-1">{m.raw_payload?.content}</CardTitle>
                </CardHeader>
              </Card>
            </div>
          ))}
          {(!data.messages || data.messages.length === 0) && <p className="text-xs text-zinc-600">No messages.</p>}
        </div>
      )}

      {/* Agent History Tab */}
      {tab === "agent" && (
        <div className="space-y-3">
          {(data.case_events || []).map((ev: { id: string; event_type: string; api_commands: Array<{ type: string; value?: unknown; name?: string }>; out_raw: { reasoning?: string }; tokens_used: number; duration_ms: number; created_at: string }) => (
            <Card key={ev.id} className="bg-zinc-900 border-zinc-800">
              <CardHeader className="py-2 px-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{ev.event_type}</Badge>
                  <span className="text-xs text-zinc-500">{new Date(ev.created_at).toLocaleString("he-IL")}</span>
                  <span className="text-xs text-zinc-600">{ev.tokens_used} tokens · {ev.duration_ms}ms</span>
                </div>
              </CardHeader>
              <CardContent className="py-2 px-3 space-y-1">
                {ev.out_raw?.reasoning && <p className="text-xs text-zinc-400">{ev.out_raw.reasoning}</p>}
                <div className="flex gap-1 flex-wrap">
                  {(ev.api_commands || []).map((cmd: { type: string; value?: unknown; name?: string }, i: number) => (
                    <Badge key={i} className="bg-zinc-800 text-zinc-300 text-xs">
                      {cmd.type}{cmd.value ? `=${String(cmd.value).slice(0, 30)}` : cmd.name ? `=${cmd.name}` : ""}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
          {(!data.case_events || data.case_events.length === 0) && <p className="text-xs text-zinc-600">No agent interactions yet. Click "Scan Now".</p>}
        </div>
      )}

      {/* History Tab */}
      {tab === "history" && (
        <div className="space-y-2">
          {(data.history || []).map((h: { id: string; actor: string; action_type: string; reasoning: string; created_at: string }, i: number) => (
            <div key={i} className="flex gap-2 text-xs">
              <span className="text-zinc-600 w-28 shrink-0">{new Date(h.created_at).toLocaleString("he-IL")}</span>
              <Badge variant="outline" className="text-xs shrink-0">{h.actor}</Badge>
              <span className="text-zinc-400">{h.action_type}</span>
              {h.reasoning && <span className="text-zinc-600 truncate">— {h.reasoning}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
