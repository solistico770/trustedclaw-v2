"use client";
import { useEffect, useState, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Gate = { id: string; type: string; display_name: string };
type Channel = { id: string; name: string; description: string | null; gate_id: string | null; external_id: string | null; gates?: Gate };

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [gates, setGates] = useState<Gate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [gateId, setGateId] = useState("");
  const [externalId, setExternalId] = useState("");

  const load = useCallback(async () => {
    const [chData, gateData] = await Promise.all([
      fetch(`/api/channels`).then(r => r.json()),
      fetch(`/api/gates`).then(r => r.json()),
    ]);
    if (Array.isArray(chData)) setChannels(chData);
    if (Array.isArray(gateData)) setGates(gateData);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!name.trim()) return;
    await fetch("/api/channels", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: description || null, gate_id: gateId || null, external_id: externalId || null }),
    });
    setName(""); setDescription(""); setGateId(""); setExternalId(""); setShowForm(false);
    load();
  }

  async function remove(id: string) {
    await fetch(`/api/channels/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Channels</h1>
          <p className="text-sm text-muted-foreground mt-1">Define your communication channels. These appear in the Simulator.</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>{showForm ? "Cancel" : "Add Channel"}</Button>
      </div>

      {/* Create form */}
      {showForm && (
        <Card className="border-primary/30">
          <CardContent className="p-5 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Channel Name *</label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Project Alpha, Family Group" className="h-9 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Gate</label>
                <select className="w-full h-9 bg-input border border-border rounded-lg px-3 text-sm" value={gateId} onChange={e => setGateId(e.target.value)}>
                  <option value="">None</option>
                  {gates.map(g => <option key={g.id} value={g.id}>{g.display_name} ({g.type})</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Description</label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" className="h-9 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">External ID</label>
              <Input value={externalId} onChange={e => setExternalId(e.target.value)} placeholder="WhatsApp group ID, Telegram chat ID, etc." className="h-9 text-sm" />
            </div>
            <Button onClick={create} disabled={!name.trim()} className="bg-primary">Create Channel</Button>
          </CardContent>
        </Card>
      )}

      {/* Channels list */}
      {loading ? (
        <div className="space-y-2 animate-pulse">{[1,2].map(i => <div key={i} className="h-16 rounded-xl bg-card" />)}</div>
      ) : channels.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No channels yet</p>
          <p className="text-sm text-muted-foreground/60 mt-1">Create your first channel to use in the Simulator</p>
        </div>
      ) : (
        <div className="space-y-2">
          {channels.map(ch => (
            <Card key={ch.id} className="border-border/50">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary text-sm font-bold shrink-0">
                  {ch.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{ch.name}</span>
                    {ch.gates && <Badge variant="secondary" className="text-[10px]">{ch.gates.type}</Badge>}
                  </div>
                  {ch.description && <p className="text-[11px] text-muted-foreground mt-0.5">{ch.description}</p>}
                  {ch.external_id && <p className="text-[10px] text-muted-foreground/60 font-mono mt-0.5">ID: {ch.external_id}</p>}
                </div>
                <Button size="sm" variant="ghost" className="h-7 text-[11px] text-destructive" onClick={() => remove(ch.id)}>Remove</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
