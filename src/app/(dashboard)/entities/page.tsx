"use client";
import { useEffect, useState, useCallback } from "react";
import { DEMO_USER_ID } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Entity = { id: string; type: string; canonical_name: string; status: string; created_at: string };

export default function EntitiesPage() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"proposed" | "active" | "all">("proposed");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const statusParam = tab === "all" ? "" : `&status=${tab === "proposed" ? "proposed" : "active"}`;
    const data = await (await fetch(`/api/entities?user_id=${DEMO_USER_ID}${statusParam}${q ? `&q=${q}` : ""}`)).json();
    if (Array.isArray(data)) setEntities(data);
    setLoading(false);
  }, [tab, q]);

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  async function approve(id: string) {
    await fetch(`/api/entities/${id}/approve`, { method: "POST" });
    load();
  }
  async function reject(id: string) {
    await fetch(`/api/entities/${id}/reject`, { method: "POST" });
    load();
  }
  async function batchAction(action: string) {
    if (selected.size === 0) return;
    await fetch("/api/entities/batch", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selected), action }),
    });
    setSelected(new Set());
    load();
  }

  function toggle(id: string) {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Entities</h2>
      <div className="flex gap-4 border-b border-zinc-800 pb-2">
        {(["proposed", "active", "all"] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); setSelected(new Set()); }}
            className={`text-sm pb-1 ${tab === t ? "text-white border-b-2 border-blue-500" : "text-zinc-500"}`}>{t}</button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input placeholder="Search..." value={q} onChange={e => setQ(e.target.value)} className="bg-zinc-800 border-zinc-700 max-w-xs" />
        {tab === "proposed" && selected.size > 0 && (
          <>
            <Button size="sm" onClick={() => batchAction("approve")} className="bg-green-700">Approve ({selected.size})</Button>
            <Button size="sm" variant="destructive" onClick={() => batchAction("reject")}>Reject ({selected.size})</Button>
          </>
        )}
      </div>
      {loading ? <div className="h-20 bg-zinc-900 rounded animate-pulse" /> : entities.length === 0 ? (
        <p className="text-zinc-500">No entities found.</p>
      ) : entities.map(e => (
        <Card key={e.id} className="bg-zinc-900 border-zinc-800">
          <CardHeader className="py-2 px-4">
            <div className="flex items-center gap-2">
              {tab === "proposed" && (
                <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} className="accent-blue-500" />
              )}
              <Badge className={`text-xs ${e.status === "active" ? "bg-green-700" : e.status === "proposed" ? "bg-yellow-700" : "bg-zinc-700"} text-white`}>{e.status}</Badge>
              <Badge variant="outline" className="text-xs">{e.type}</Badge>
              <CardTitle className="text-sm">{e.canonical_name}</CardTitle>
              <span className="text-xs text-zinc-600 mr-auto">{new Date(e.created_at).toLocaleDateString("he-IL")}</span>
              {e.status === "proposed" && (
                <>
                  <Button size="sm" variant="outline" className="text-xs h-6" onClick={() => approve(e.id)}>Approve</Button>
                  <Button size="sm" variant="ghost" className="text-xs h-6 text-red-400" onClick={() => reject(e.id)}>Reject</Button>
                </>
              )}
            </div>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
