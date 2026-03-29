"use client";
import { useEffect, useState } from "react";
import { DEMO_USER_ID } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SettingsPage() {
  const [prompt, setPrompt] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/settings/context-prompt?user_id=${DEMO_USER_ID}`)
      .then(r => r.json()).then(d => { setPrompt(d.context_prompt || ""); setLoading(false); });
  }, []);

  async function save() {
    await fetch("/api/settings/context-prompt", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: DEMO_USER_ID, context_prompt: prompt }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-xl font-bold">Settings</h2>
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader><CardTitle className="text-sm">Context Prompt</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-zinc-500">הטקסט הזה מוזרק לתחילת כל שיחה עם ה-agent. כתוב בו מי אתה, מה חשוב לך, ומה להתעלם ממנו.</p>
          {loading ? <div className="h-32 bg-zinc-800 rounded animate-pulse" /> :
            <Textarea value={prompt} onChange={e => setPrompt(e.target.value)} className="bg-zinc-800 border-zinc-700 min-h-[200px] font-mono text-xs" />}
          <div className="flex gap-2 items-center">
            <Button onClick={save}>Save</Button>
            {saved && <span className="text-green-400 text-xs">Saved!</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
