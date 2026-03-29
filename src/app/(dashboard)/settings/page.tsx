"use client";
import { useEffect, useState } from "react";
import { DEMO_USER_ID } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";

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
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

      {/* Navigation */}
      <div className="flex gap-3">
        <Link href="/settings" className="text-sm font-medium text-primary border-b-2 border-primary pb-1">Context Prompt</Link>
        <Link href="/settings/channels" className="text-sm text-muted-foreground hover:text-foreground pb-1">Channels</Link>
      </div>

      {/* Context Prompt */}
      <Card className="border-border/50">
        <CardContent className="p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold mb-1">Agent Context Prompt</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              This text is injected at the start of every AI agent scan. Tell the agent who you are, what matters, and what to ignore.
            </p>
          </div>

          {loading ? (
            <div className="h-48 bg-card rounded-lg animate-pulse" />
          ) : (
            <Textarea value={prompt} onChange={e => setPrompt(e.target.value)}
              className="min-h-[240px] font-mono text-[13px] leading-relaxed"
              placeholder="You are an operational agent working for... High priority: ... Low priority: ..." />
          )}

          <div className="flex gap-3 items-center">
            <Button onClick={save} className="bg-primary">Save Prompt</Button>
            {saved && <span className="text-sm text-emerald-400">Saved!</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
