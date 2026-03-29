"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LEVEL_COLORS } from "@/lib/scan-intervals";

type EntityDetail = {
  entity: { id: string; canonical_name: string; type: string; phone?: string; email?: string; whatsapp_number?: string; telegram_handle?: string; website?: string };
  cases: Array<{ id: string; case_number: number; title: string; status: string; urgency: number; importance: number; role: string }>;
  messages: Array<{ id: string; content: string; sender: string; occurred_at: string; case_number: number; case_title: string }>;
  case_count: number;
  message_count: number;
};

const STATUS_COLOR: Record<string, string> = {
  open: "text-blue-600 dark:text-blue-400", action_needed: "text-red-600 dark:text-red-400",
  in_progress: "text-violet-600 dark:text-violet-400", addressed: "text-emerald-600 dark:text-emerald-400",
  closed: "text-zinc-500",
};

export default function EntityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<EntityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<"cases" | "messages">("cases");

  const load = useCallback(async () => {
    const d = await (await fetch(`/api/entities/${id}`)).json();
    setData(d);
    if (d.entity) setEditFields({
      canonical_name: d.entity.canonical_name || "",
      type: d.entity.type || "other",
      phone: d.entity.phone || "",
      email: d.entity.email || "",
      whatsapp_number: d.entity.whatsapp_number || "",
      telegram_handle: d.entity.telegram_handle || "",
      website: d.entity.website || "",
    });
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function saveEdit() {
    await fetch(`/api/entities/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editFields),
    });
    setEditing(false);
    load();
  }

  if (loading) return <div className="h-64 rounded-xl bg-card animate-pulse" />;
  if (!data?.entity) return <p className="text-muted-foreground">Entity not found.</p>;
  const e = data.entity;

  return (
    <div className="space-y-6">
      <button onClick={() => router.push("/entities")} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
        <svg className="w-4 h-4 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        Back to Entities
      </button>

      {/* Profile */}
      <Card className="border-border/50">
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-bold shrink-0 ${
              e.type === "person" ? "bg-blue-100 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400" :
              e.type === "company" ? "bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400" :
              "bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400"
            }`}>{e.canonical_name[0]}</div>
            <div className="flex-1">
              {editing ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-muted-foreground">Name</label><Input value={editFields.canonical_name} onChange={ev => setEditFields(p => ({ ...p, canonical_name: ev.target.value }))} className="h-8 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">Type</label>
                      <select className="w-full h-8 bg-input border border-border rounded-lg px-2 text-sm" value={editFields.type} onChange={ev => setEditFields(p => ({ ...p, type: ev.target.value }))}>
                        {["person", "company", "project", "invoice", "other"].map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div><label className="text-xs text-muted-foreground">Phone</label><Input value={editFields.phone} onChange={ev => setEditFields(p => ({ ...p, phone: ev.target.value }))} className="h-8 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">Email</label><Input value={editFields.email} onChange={ev => setEditFields(p => ({ ...p, email: ev.target.value }))} className="h-8 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">WhatsApp</label><Input value={editFields.whatsapp_number} onChange={ev => setEditFields(p => ({ ...p, whatsapp_number: ev.target.value }))} className="h-8 text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground">Telegram</label><Input value={editFields.telegram_handle} onChange={ev => setEditFields(p => ({ ...p, telegram_handle: ev.target.value }))} className="h-8 text-sm" /></div>
                    <div className="col-span-2"><label className="text-xs text-muted-foreground">Website</label><Input value={editFields.website} onChange={ev => setEditFields(p => ({ ...p, website: ev.target.value }))} className="h-8 text-sm" /></div>
                  </div>
                  <div className="flex gap-2"><Button size="sm" onClick={saveEdit} className="bg-primary">Save</Button><Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button></div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <h1 className="text-xl font-bold">{e.canonical_name}</h1>
                    <Badge variant="secondary">{e.type}</Badge>
                    <Button size="sm" variant="ghost" className="h-6 text-[11px] mr-auto" onClick={() => setEditing(true)}>Edit</Button>
                  </div>
                  <div className="flex gap-4 text-sm text-muted-foreground flex-wrap">
                    {e.phone && <span>Tel: {e.phone}</span>}
                    {e.email && <span>{e.email}</span>}
                    {e.whatsapp_number && <span>WA: {e.whatsapp_number}</span>}
                    {e.telegram_handle && <span>TG: {e.telegram_handle}</span>}
                    {e.website && <span>{e.website}</span>}
                  </div>
                  <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                    <span>{data.case_count} cases</span>
                    <span>{data.message_count} messages</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex gap-1 bg-card rounded-xl p-1">
        <button onClick={() => setTab("cases")} className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${tab === "cases" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
          Cases ({data.case_count})
        </button>
        <button onClick={() => setTab("messages")} className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${tab === "messages" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
          Messages ({data.message_count})
        </button>
      </div>

      {/* Cases tab */}
      {tab === "cases" && (
        <div className="space-y-2">
          {data.cases.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No connected cases</p> :
            data.cases.map((c, i) => {
              const uc = LEVEL_COLORS[c.urgency] || LEVEL_COLORS[3];
              return (
                <Card key={i} className="cursor-pointer border-border/50 hover:border-primary/40" onClick={() => router.push(`/cases/${c.id}`)}>
                  <CardContent className="px-4 py-3 flex items-center gap-3">
                    <span className="text-xs font-mono text-muted-foreground">#{c.case_number}</span>
                    <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold ${uc.bg} ${uc.text}`}>{c.urgency}</span>
                    <span className="font-medium text-sm flex-1 truncate">{c.title || `Case #${c.case_number}`}</span>
                    <span className={`text-[10px] font-medium ${STATUS_COLOR[c.status] || ""}`}>{c.status}</span>
                    <Badge variant="outline" className="text-[10px]">{c.role}</Badge>
                  </CardContent>
                </Card>
              );
            })}
        </div>
      )}

      {/* Messages tab — cross-case */}
      {tab === "messages" && (
        <div className="space-y-2">
          {data.messages.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No messages</p> :
            data.messages.map((m, i) => (
              <div key={i} className="flex gap-3 p-3 rounded-lg bg-card/50 hover:bg-card transition-colors">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">{m.sender[0]}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{m.sender}</span>
                    <span className="text-[10px] text-muted-foreground">#{m.case_number}</span>
                    <span className="text-[10px] text-muted-foreground">{new Date(m.occurred_at).toLocaleString("he-IL")}</span>
                  </div>
                  <p className="text-sm text-foreground/80 mt-0.5">{m.content}</p>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
