"use client";

import { useState } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const router = useRouter();
  const supabase = createBrowserClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) { setError("סיסמה חייבת להיות לפחות 6 תווים"); return; }
    if (password !== confirm) { setError("הסיסמאות לא תואמות"); return; }

    setLoading(true); setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) setError(error.message);
    else {
      setDone(true);
      setTimeout(() => router.push("/"), 2000);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4" dir="rtl">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">סיסמה חדשה</CardTitle>
          <CardDescription>הזן סיסמה חדשה לחשבון שלך</CardDescription>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-destructive mb-3">{error}</p>}
          {done ? (
            <div className="text-center space-y-2">
              <p className="text-sm text-emerald-600 dark:text-emerald-400">הסיסמה עודכנה בהצלחה!</p>
              <p className="text-xs text-muted-foreground">מעביר אותך...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <Input type="password" placeholder="סיסמה חדשה (מינימום 6 תווים)" value={password}
                onChange={e => setPassword(e.target.value)} required dir="ltr" minLength={6} />
              <Input type="password" placeholder="אימות סיסמה" value={confirm}
                onChange={e => setConfirm(e.target.value)} required dir="ltr" minLength={6} />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "מעדכן..." : "עדכן סיסמה"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
