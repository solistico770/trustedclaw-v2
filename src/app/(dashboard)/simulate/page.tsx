"use client";
import { useState, useEffect, useCallback } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Gate = { id: string; type: string; display_name: string; metadata?: { is_admin_gate?: boolean } };

export default function SimulatePage() {
  const [gates, setGates] = useState<Gate[]>([]);
  const [gateId, setGateId] = useState("");
  const [sender, setSender] = useState("");
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ signal_id: string } | null>(null);

  const loadGates = useCallback(async () => {
    const data = await (await fetch(`/api/gates`)).json();
    if (Array.isArray(data)) {
      setGates(data);
      if (data.length > 0 && !gateId) setGateId(data[0].id);
    }
  }, [gateId]);

  useEffect(() => { loadGates(); }, [loadGates]);

  const selectedGate = gates.find(g => g.id === gateId);
  const isAdmin = selectedGate?.metadata?.is_admin_gate;

  async function send() {
    if (!content.trim() || !gateId) return;
    setSending(true); setResult(null);
    const data = await (await fetch("/api/simulate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gate_type: selectedGate?.type || "generic",
        sender_name: isAdmin ? "Admin" : (sender || "Unknown"),
        message_content: content,
      }),
    })).json();
    setResult(data); setSending(false);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Simulator</h1>
        <p className="text-sm text-muted-foreground mt-1">Simulate a message through a gate. Select gate first, then type the message.</p>
      </div>

      <Card className="border-border/50">
        <CardContent className="p-5 space-y-4">
          {/* Gate selector */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Select Gate</label>
            {gates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No gates. <a href="/settings" className="text-primary hover:underline">Create one in Settings</a></p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {gates.map(g => (
                  <button key={g.id} onClick={() => setGateId(g.id)}
                    className={`p-3 rounded-lg border text-sm text-right transition-all ${
                      gateId === g.id
                        ? "border-primary bg-primary/10 dark:bg-primary/15"
                        : "border-border/50 bg-card hover:border-border"
                    }`}>
                    <div className="flex items-center gap-2">
                      <span className={`w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 ${
                        g.metadata?.is_admin_gate ? "bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-primary/10 text-primary"
                      }`}>{g.type.slice(0, 2).toUpperCase()}</span>
                      <div>
                        <p className="font-medium text-foreground">{g.display_name}</p>
                        <p className="text-[10px] text-muted-foreground">{g.type}{g.metadata?.is_admin_gate ? " · admin" : ""}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sender — hidden for admin gate */}
          {!isAdmin && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Sender Name</label>
              <Input value={sender} onChange={e => setSender(e.target.value)} placeholder="David Cohen" className="h-9 text-sm" />
            </div>
          )}

          {isAdmin && (
            <div className="bg-amber-100/50 dark:bg-amber-500/10 border border-amber-300/50 dark:border-amber-500/20 rounded-lg px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              Admin gate — sender is you (admin entity auto-attached)
            </div>
          )}

          {/* Message */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Message</label>
            <Textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Type a message..." className="min-h-[120px] text-sm" />
          </div>

          <div className="flex gap-2">
            <Button onClick={send} disabled={sending || !content.trim() || !gateId} className="bg-primary">
              {sending ? "Sending..." : `Send via ${selectedGate?.display_name || "..."}`}
            </Button>
            <Button variant="ghost" onClick={() => { setContent(""); setResult(null); setSender(""); }}>Clear</Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">Saved</Badge>
              <span className="text-xs text-muted-foreground">via {selectedGate?.display_name}</span>
            </div>
            <p className="text-sm text-foreground/80">
              Signal {result.signal_id.slice(0, 8)}... saved as pending
            </p>
            <p className="text-xs text-muted-foreground mt-1">Signal is pending — AI will triage it on the next scan cycle and assign it to a case.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
