"use client";
import { useState, useEffect, useCallback } from "react";
import { DEMO_USER_ID } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Channel = { id: string; name: string; gate_id: string; gates?: { type: string; display_name: string } };

export default function SimulatePage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelId, setChannelId] = useState("");
  const [sender, setSender] = useState("");
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ message_id: string; case_id: string } | null>(null);

  const loadChannels = useCallback(async () => {
    const data = await (await fetch(`/api/channels?user_id=${DEMO_USER_ID}`)).json();
    if (Array.isArray(data)) setChannels(data);
  }, []);

  useEffect(() => { loadChannels(); }, [loadChannels]);

  const selectedChannel = channels.find(c => c.id === channelId);

  async function send() {
    if (!content.trim()) return;
    setSending(true); setResult(null);
    const data = await (await fetch("/api/messages/ingest", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gate_type: selectedChannel?.gates?.type || "simulator",
        sender_name: sender || "Simulator",
        channel_name: selectedChannel?.name || "Simulator",
        channel_id: channelId || undefined,
        content,
        user_id: DEMO_USER_ID,
      }),
    })).json();
    setResult(data); setSending(false);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Simulator</h1>
        <p className="text-sm text-muted-foreground mt-1">Send a test message. No AI runs — just saves to DB and creates a pending case.</p>
      </div>

      <Card className="border-border/50">
        <CardContent className="p-5 space-y-4">
          {/* Channel select */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Channel</label>
            {channels.length === 0 ? (
              <div className="text-sm text-muted-foreground bg-card rounded-lg p-3 border border-border/50">
                No channels defined yet.{" "}
                <a href="/settings/channels" className="text-primary hover:underline">Create channels in Settings</a>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {channels.map(ch => (
                  <button key={ch.id} onClick={() => setChannelId(ch.id)}
                    className={`text-right p-3 rounded-lg border text-sm transition-all ${
                      channelId === ch.id
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border/50 bg-card hover:border-border text-muted-foreground"
                    }`}>
                    <div className="font-medium">{ch.name}</div>
                    <div className="text-[11px] opacity-60">{ch.gates?.type || "generic"}</div>
                  </button>
                ))}
                <button onClick={() => setChannelId("")}
                  className={`text-right p-3 rounded-lg border text-sm transition-all ${
                    !channelId ? "border-primary bg-primary/10" : "border-border/50 bg-card hover:border-border text-muted-foreground"
                  }`}>
                  <div className="font-medium">No channel</div>
                  <div className="text-[11px] opacity-60">generic</div>
                </button>
              </div>
            )}
          </div>

          {/* Sender */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Sender Name</label>
            <Input value={sender} onChange={e => setSender(e.target.value)} placeholder="David Cohen" className="h-9 text-sm" />
          </div>

          {/* Message */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Message</label>
            <Textarea value={content} onChange={e => setContent(e.target.value)}
              placeholder="Type a message to simulate..."
              className="min-h-[100px] text-sm" />
          </div>

          {/* Send */}
          <div className="flex gap-2">
            <Button onClick={send} disabled={sending || !content.trim()} className="bg-primary">
              {sending ? "Sending..." : "Send Message"}
            </Button>
            <Button variant="ghost" onClick={() => { setContent(""); setResult(null); }}>Clear</Button>
          </div>
        </CardContent>
      </Card>

      {/* Result */}
      {result && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">Saved</Badge>
              <span className="text-sm text-foreground/80">Case created</span>
            </div>
            <a href={`/cases/${result.case_id}`} className="text-sm text-primary hover:underline">
              Open Case {result.case_id.slice(0, 8)}... →
            </a>
            <p className="text-xs text-muted-foreground mt-1">Click &quot;Scan Now&quot; on the case to trigger the AI agent.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
