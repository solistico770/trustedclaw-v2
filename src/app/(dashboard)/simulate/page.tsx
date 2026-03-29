"use client";
import { useState } from "react";
import { DEMO_USER_ID } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";

export default function SimulatePage() {
  const [gateType, setGateType] = useState("simulator");
  const [sender, setSender] = useState("");
  const [channel, setChannel] = useState("");
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ message_id: string; case_id: string } | null>(null);

  async function send() {
    if (!content.trim()) return;
    setSending(true); setResult(null);
    const data = await (await fetch("/api/simulate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gate_type: gateType, sender_name: sender || "Simulator", channel_name: channel || "Simulator", message_content: content, user_id: DEMO_USER_ID }),
    })).json();
    setResult(data);
    setSending(false);
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-xl font-bold">Simulator</h2>
      <p className="text-xs text-zinc-500">שלח הודעה כאילו הגיעה מערוץ אמיתי. Case ייפתח בסטטוס pending ויחכה ל-agent scan.</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-zinc-500">Gate Type</label>
          <select className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm" value={gateType} onChange={e => setGateType(e.target.value)}>
            {["simulator","whatsapp","telegram","slack","email","generic"].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div><label className="text-xs text-zinc-500">Sender</label><Input value={sender} onChange={e => setSender(e.target.value)} placeholder="David Cohen" className="bg-zinc-800 border-zinc-700" /></div>
      </div>
      <div><label className="text-xs text-zinc-500">Channel</label><Input value={channel} onChange={e => setChannel(e.target.value)} placeholder="Project Alpha" className="bg-zinc-800 border-zinc-700" /></div>
      <div><label className="text-xs text-zinc-500">Message</label><Textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Type message..." className="bg-zinc-800 border-zinc-700 min-h-[100px]" /></div>
      <div className="flex gap-2">
        <Button onClick={send} disabled={sending || !content.trim()}>{sending ? "Sending..." : "Send"}</Button>
        <Button variant="outline" onClick={() => { setContent(""); setResult(null); }}>Reset</Button>
      </div>
      {result && (
        <Card className="bg-green-950/30 border-green-800">
          <CardContent className="py-3">
            <p className="text-sm text-green-400">Message saved! Case: <a href={`/cases/${result.case_id}`} className="underline">{result.case_id.slice(0, 8)}...</a></p>
            <p className="text-xs text-green-600">Case is pending — click "Scan Now" on the case to trigger the agent.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
