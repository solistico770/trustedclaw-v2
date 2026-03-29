"use client";
import { useEffect, useState, useCallback } from "react";
import { DEMO_USER_ID } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Entity = {
  id: string; type: string; canonical_name: string; status: string; created_at: string;
  phone?: string; email?: string; whatsapp_number?: string; telegram_handle?: string; website?: string; external_id?: string;
};

const TYPE_ICON: Record<string, string> = {
  person: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
  company: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
  project: "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01",
  invoice: "M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z",
};

function TypeIcon({ type }: { type: string }) {
  const d = TYPE_ICON[type] || "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z";
  return <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d={d} /></svg>;
}

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

  async function approve(id: string) { await fetch(`/api/entities/${id}/approve`, { method: "POST" }); load(); }
  async function reject(id: string) { await fetch(`/api/entities/${id}/reject`, { method: "POST" }); load(); }
  async function batchAction(action: string) {
    if (!selected.size) return;
    await fetch("/api/entities/batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: Array.from(selected), action }) });
    setSelected(new Set()); load();
  }
  function toggle(id: string) { const s = new Set(selected); s.has(id) ? s.delete(id) : s.add(id); setSelected(s); }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Entities</h1>
        <p className="text-sm text-muted-foreground mt-1">People, companies, and things the AI found in your messages</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-card rounded-xl p-1 max-w-md">
        {([
          { key: "proposed", label: "Pending Approval" },
          { key: "active", label: "Active" },
          { key: "all", label: "All" },
        ] as const).map(t => (
          <button key={t.key} onClick={() => { setTab(t.key as typeof tab); setSelected(new Set()); }}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
              tab === t.key ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}>{t.label}</button>
        ))}
      </div>

      {/* Search + batch */}
      <div className="flex gap-3 items-center">
        <Input placeholder="Search by name..." value={q} onChange={e => setQ(e.target.value)} className="max-w-xs h-9 text-sm" />
        {tab === "proposed" && selected.size > 0 && (
          <>
            <Button size="sm" onClick={() => batchAction("approve")} className="bg-emerald-600 hover:bg-emerald-500 h-8">
              Approve {selected.size}
            </Button>
            <Button size="sm" variant="destructive" className="h-8" onClick={() => batchAction("reject")}>
              Reject {selected.size}
            </Button>
          </>
        )}
      </div>

      {/* Entities */}
      {loading ? (
        <div className="space-y-2 animate-pulse">{[1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-card" />)}</div>
      ) : entities.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No entities found</p>
          <p className="text-sm text-muted-foreground/60 mt-1">Entities are proposed by the AI when it scans cases</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entities.map(e => (
            <Card key={e.id} className="border-border/50 hover:border-border transition-colors">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  {tab === "proposed" && (
                    <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)}
                      className="w-4 h-4 rounded accent-primary" />
                  )}
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    e.status === "active" ? "bg-emerald-500/10 text-emerald-400" :
                    e.status === "proposed" ? "bg-amber-500/10 text-amber-400" : "bg-muted text-muted-foreground"
                  }`}>
                    <TypeIcon type={e.type} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-foreground/90">{e.canonical_name}</span>
                      <Badge variant="secondary" className="text-[10px]">{e.type}</Badge>
                      {e.status === "proposed" && <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/20 text-[10px]">Pending</Badge>}
                    </div>
                    <div className="flex gap-3 mt-1 text-[11px] text-muted-foreground">
                      {e.phone && <span>Tel: {e.phone}</span>}
                      {e.email && <span>Email: {e.email}</span>}
                      {e.whatsapp_number && <span>WA: {e.whatsapp_number}</span>}
                      {e.telegram_handle && <span>TG: {e.telegram_handle}</span>}
                      {e.website && <span>Web: {e.website}</span>}
                      {e.external_id && <span>ID: {e.external_id}</span>}
                      {!e.phone && !e.email && !e.whatsapp_number && !e.telegram_handle && (
                        <span>Created {new Date(e.created_at).toLocaleDateString("he-IL")}</span>
                      )}
                    </div>
                  </div>

                  {e.status === "proposed" && (
                    <div className="flex gap-1.5">
                      <Button size="sm" className="h-7 text-[11px] bg-emerald-600 hover:bg-emerald-500" onClick={() => approve(e.id)}>Approve</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-[11px] text-destructive" onClick={() => reject(e.id)}>Reject</Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
