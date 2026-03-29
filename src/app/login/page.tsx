"use client";

import { useState } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Mode = "choose" | "email" | "phone" | "email-sent" | "otp";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("choose");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createBrowserClient();

  async function sendEmailLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setMode("email-sent");
  }

  async function sendPhoneOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formatted = phone.startsWith("+") ? phone : `+972${phone.replace(/^0/, "")}`;
    const { error } = await supabase.auth.signInWithOtp({ phone: formatted });
    setLoading(false);
    if (error) setError(error.message);
    else { setPhone(formatted); setMode("otp"); }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ phone, token: otp, type: "sms" });
    setLoading(false);
    if (error) setError(error.message);
    else router.push("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4" dir="rtl">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">TrustedClaw</CardTitle>
          <CardDescription>כניסה למערכת</CardDescription>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-destructive mb-3">{error}</p>}

          {mode === "choose" && (
            <div className="space-y-3">
              <Button variant="outline" className="w-full" onClick={() => setMode("phone")}>
                כניסה עם טלפון
              </Button>
              <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => setMode("email")}>
                כניסה עם אימייל
              </Button>
            </div>
          )}

          {mode === "email" && (
            <form onSubmit={sendEmailLink} className="space-y-4">
              <Input type="email" placeholder="you@example.com" value={email}
                onChange={(e) => setEmail(e.target.value)} required dir="ltr" />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "שולח..." : "שלח קישור כניסה"}
              </Button>
              <Button variant="ghost" size="sm" className="w-full" onClick={() => { setMode("choose"); setError(null); }}>
                חזור
              </Button>
            </form>
          )}

          {mode === "email-sent" && (
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                שלחנו קישור כניסה ל-<strong>{email}</strong>
              </p>
              <p className="text-xs text-muted-foreground">בדוק את תיבת המייל שלך</p>
              <Button variant="ghost" size="sm" onClick={() => setMode("email")}>שלח שוב</Button>
            </div>
          )}

          {mode === "phone" && (
            <form onSubmit={sendPhoneOtp} className="space-y-4">
              <div className="space-y-1">
                <Input type="tel" placeholder="050-1234567" value={phone}
                  onChange={(e) => setPhone(e.target.value)} required dir="ltr" />
                <p className="text-[10px] text-muted-foreground">מספר ישראלי — נוסיף +972 אוטומטית</p>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "שולח..." : "שלח קוד SMS"}
              </Button>
              <Button variant="ghost" size="sm" className="w-full" onClick={() => { setMode("choose"); setError(null); }}>
                חזור
              </Button>
            </form>
          )}

          {mode === "otp" && (
            <form onSubmit={verifyOtp} className="space-y-4">
              <div className="text-center mb-2">
                <p className="text-sm text-muted-foreground">שלחנו קוד ל-<strong dir="ltr">{phone}</strong></p>
              </div>
              <Input type="text" inputMode="numeric" placeholder="123456" maxLength={6}
                value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} required
                dir="ltr" className="text-center text-2xl tracking-[0.5em] font-mono" />
              <Button type="submit" className="w-full" disabled={loading || otp.length < 6}>
                {loading ? "מאמת..." : "אימות"}
              </Button>
              <Button variant="ghost" size="sm" className="w-full" onClick={() => { setMode("phone"); setOtp(""); setError(null); }}>
                שלח שוב
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
