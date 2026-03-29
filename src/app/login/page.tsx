"use client";

import { useState } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type View = "login" | "signup" | "reset" | "reset-sent" | "magic-sent" | "phone" | "otp";

export default function LoginPage() {
  const [view, setView] = useState<View>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createBrowserClient();

  function reset() { setError(null); setMessage(null); }
  function go(v: View) { reset(); setView(v); }

  // ── Email + Password Login ──
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); reset();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setError(error.message);
    else router.push("/");
  }

  // ── Email + Password Signup ──
  async function handleSignup(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); reset();
    if (password.length < 6) { setError("סיסמה חייבת להיות לפחות 6 תווים"); setLoading(false); return; }
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setMessage("נשלח אימייל אימות — בדוק את תיבת הדואר שלך");
  }

  // ── Password Reset ──
  async function handleReset(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); reset();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setLoading(false);
    if (error) setError(error.message);
    else go("reset-sent");
  }

  // ── Magic Link ──
  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); reset();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    if (error) setError(error.message);
    else go("magic-sent");
  }

  // ── Phone OTP ──
  async function sendPhoneOtp(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); reset();
    const formatted = phone.startsWith("+") ? phone : `+972${phone.replace(/^0/, "")}`;
    const { error } = await supabase.auth.signInWithOtp({ phone: formatted });
    setLoading(false);
    if (error) setError(error.message);
    else { setPhone(formatted); go("otp"); }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); reset();
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
          <CardDescription>
            {view === "login" && "כניסה למערכת"}
            {view === "signup" && "הרשמה"}
            {view === "reset" && "איפוס סיסמה"}
            {view === "phone" && "כניסה עם טלפון"}
            {view === "otp" && "הזן קוד"}
            {view === "reset-sent" && "בדוק את המייל"}
            {view === "magic-sent" && "בדוק את המייל"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-destructive mb-3">{error}</p>}
          {message && <p className="text-sm text-emerald-600 dark:text-emerald-400 mb-3">{message}</p>}

          {/* ── LOGIN ── */}
          {view === "login" && (
            <form onSubmit={handleLogin} className="space-y-3">
              <Input type="email" placeholder="אימייל" value={email}
                onChange={e => setEmail(e.target.value)} required dir="ltr" />
              <Input type="password" placeholder="סיסמה" value={password}
                onChange={e => setPassword(e.target.value)} required dir="ltr" />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "מתחבר..." : "כניסה"}
              </Button>
              <div className="flex flex-col gap-1.5 pt-2">
                <button type="button" className="text-xs text-primary hover:underline" onClick={() => go("reset")}>
                  שכחתי סיסמה
                </button>
                <div className="flex items-center gap-2 my-2">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[10px] text-muted-foreground">או</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <Button type="button" variant="outline" size="sm" className="w-full" onClick={sendMagicLink}>
                  שלח קישור כניסה למייל
                </Button>
                <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => go("phone")}>
                  כניסה עם טלפון
                </Button>
                <div className="flex items-center gap-2 my-1">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[10px] text-muted-foreground">אין חשבון?</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => go("signup")}>
                  הרשמה
                </Button>
              </div>
            </form>
          )}

          {/* ── SIGNUP ── */}
          {view === "signup" && (
            <form onSubmit={handleSignup} className="space-y-3">
              <Input type="email" placeholder="אימייל" value={email}
                onChange={e => setEmail(e.target.value)} required dir="ltr" />
              <Input type="password" placeholder="סיסמה (מינימום 6 תווים)" value={password}
                onChange={e => setPassword(e.target.value)} required dir="ltr" minLength={6} />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "נרשם..." : "הרשמה"}
              </Button>
              <button type="button" className="text-xs text-muted-foreground hover:text-foreground w-full text-center"
                onClick={() => go("login")}>
                כבר יש לי חשבון — כניסה
              </button>
            </form>
          )}

          {/* ── RESET PASSWORD ── */}
          {view === "reset" && (
            <form onSubmit={handleReset} className="space-y-3">
              <p className="text-xs text-muted-foreground">נשלח קישור לאיפוס הסיסמה</p>
              <Input type="email" placeholder="אימייל" value={email}
                onChange={e => setEmail(e.target.value)} required dir="ltr" />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "שולח..." : "שלח קישור איפוס"}
              </Button>
              <button type="button" className="text-xs text-muted-foreground hover:text-foreground w-full text-center"
                onClick={() => go("login")}>
                חזרה לכניסה
              </button>
            </form>
          )}

          {/* ── RESET SENT ── */}
          {view === "reset-sent" && (
            <div className="text-center space-y-3">
              <p className="text-sm text-muted-foreground">שלחנו קישור איפוס ל-<strong>{email}</strong></p>
              <p className="text-xs text-muted-foreground">בדוק את תיבת הדואר שלך</p>
              <button type="button" className="text-xs text-primary hover:underline" onClick={() => go("login")}>
                חזרה לכניסה
              </button>
            </div>
          )}

          {/* ── MAGIC LINK SENT ── */}
          {view === "magic-sent" && (
            <div className="text-center space-y-3">
              <p className="text-sm text-muted-foreground">שלחנו קישור כניסה ל-<strong>{email}</strong></p>
              <p className="text-xs text-muted-foreground">בדוק את תיבת הדואר שלך</p>
              <Button variant="ghost" size="sm" onClick={() => go("login")}>חזרה לכניסה</Button>
            </div>
          )}

          {/* ── PHONE ── */}
          {view === "phone" && (
            <form onSubmit={sendPhoneOtp} className="space-y-3">
              <Input type="tel" placeholder="050-1234567" value={phone}
                onChange={e => setPhone(e.target.value)} required dir="ltr" />
              <p className="text-[10px] text-muted-foreground">מספר ישראלי — נוסיף +972 אוטומטית</p>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "שולח..." : "שלח קוד SMS"}
              </Button>
              <button type="button" className="text-xs text-muted-foreground hover:text-foreground w-full text-center"
                onClick={() => go("login")}>
                חזרה לכניסה
              </button>
            </form>
          )}

          {/* ── OTP VERIFY ── */}
          {view === "otp" && (
            <form onSubmit={verifyOtp} className="space-y-3">
              <p className="text-sm text-muted-foreground text-center">שלחנו קוד ל-<strong dir="ltr">{phone}</strong></p>
              <Input type="text" inputMode="numeric" placeholder="123456" maxLength={6}
                value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ""))} required
                dir="ltr" className="text-center text-2xl tracking-[0.5em] font-mono" />
              <Button type="submit" className="w-full" disabled={loading || otp.length < 6}>
                {loading ? "מאמת..." : "אימות"}
              </Button>
              <button type="button" className="text-xs text-muted-foreground hover:text-foreground w-full text-center"
                onClick={() => { setOtp(""); go("phone"); }}>
                שלח שוב
              </button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
