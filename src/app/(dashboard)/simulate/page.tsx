"use client";
import { useState } from "react";
import { DEMO_USER_ID } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function SimulatePage() {
  const [sender, setSender] = useState("");
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ message_id: string; case_id: string } | null>(null);

  async function send() {
    if (!content.trim()) return;
    setSending(true); setResult(null);
    const data = await (await fetch("/api/messages/ingest", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gate_type: "simulator",
        sender_name: sender || "Simulator",
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
        <p className="text-sm text-muted-foreground mt-1">Send a test message. No AI runs — creates a pending case for the agent to scan.</p>
      </div>

      <Card className="border-border/50">
        <CardContent className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Sender Name</label>
            <Input value={sender} onChange={e => setSender(e.target.value)} placeholder="David Cohen" className="h-9 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Message</label>
            <Textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Type a message..." className="min-h-[120px] text-sm" />
          </div>
          <div className="flex gap-2">
            <Button onClick={send} disabled={sending || !content.trim()} className="bg-primary">{sending ? "Sending..." : "Send"}</Button>
            <Button variant="ghost" onClick={() => { setContent(""); setResult(null); setSender(""); }}>Clear</Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">Saved</Badge>
            </div>
            <a href={`/cases/${result.case_id}`} className="text-sm text-primary hover:underline">
              Open Case {result.case_id.slice(0, 8)}... →
            </a>
            <p className="text-xs text-muted-foreground mt-1">Case is pending — agent will scan it on next cycle, or click &quot;Scan Now&quot; on the case.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
