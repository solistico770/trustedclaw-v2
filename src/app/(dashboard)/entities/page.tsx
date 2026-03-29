"use client";
import { useEffect, useState, useCallback } from "react";
import { DEMO_USER_ID } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";

type Entity = { id: string; type: string; canonical_name: string; status: string; phone?: string; email?: string; created_at: string };

const TYPE_COLORS: Record<string, string> = {
  person: "text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-500/15",
  company: "text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-500/15",
  project: "text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/15",
  invoice: "text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-500/15",
  other: "text-zinc-500 bg-zinc-100 dark:bg-zinc-500/15",
};

export default function EntitiesPage() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const router = useRouter();

  const load = useCallback(async () => {
    const params = `user_id=${DEMO_USER_ID}&status=active${q ? `&q=${q}` : ""}${typeFilter ? `&type=${typeFilter}` : ""}`;
    const data = await (await fetch(`/api/entities?${params}`)).json();
    if (Array.isArray(data)) setEntities(data);
    setLoading(false);
  }, [q, typeFilter]);

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">Entities</h1>
      <p className="text-sm text-muted-foreground">People, companies, and things tracked across all your cases.</p>

      <div className="flex items-center gap-3">
        <Input placeholder="Search by name..." value={q} onChange={e => setQ(e.target.value)} className="max-w-xs h-9 text-sm" />
        <select className="h-9 bg-input border border-border rounded-lg px-3 text-sm text-foreground" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          {["person", "company", "project", "invoice", "other"].map(t => <option key={t}>{t}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{entities.length} entities</span>
      </div>

      {loading ? <div className="space-y-2 animate-pulse">{[1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-card" />)}</div> :
        entities.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No entities yet</p>
            <p className="text-sm text-muted-foreground/60 mt-1">Entities are discovered by the agent when scanning cases</p>
          </div>
        ) : (
          <div className="space-y-2">
            {entities.map(e => (
              <Card key={e.id} className="cursor-pointer border-border/50 hover:border-primary/40 transition-all" onClick={() => router.push(`/entities/${e.id}`)}>
                <CardContent className="px-4 py-3 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${TYPE_COLORS[e.type] || TYPE_COLORS.other}`}>
                    {e.type.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{e.canonical_name}</span>
                      <Badge variant="secondary" className="text-[10px]">{e.type}</Badge>
                    </div>
                    <div className="flex gap-3 text-[11px] text-muted-foreground mt-0.5">
                      {e.phone && <span>Tel: {e.phone}</span>}
                      {e.email && <span>{e.email}</span>}
                      <span>since {new Date(e.created_at).toLocaleDateString("he-IL")}</span>
                    </div>
                  </div>
                  <svg className="w-4 h-4 text-muted-foreground shrink-0 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
    </div>
  );
}
