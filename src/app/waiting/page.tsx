"use client";

import { createBrowserClient } from "@/lib/supabase-browser";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function WaitingPage() {
  const router = useRouter();
  const supabase = createBrowserClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4" dir="rtl">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">ממתין לאישור</CardTitle>
          <CardDescription>
            החשבון שלך ממתין לאישור מנהל. תקבל גישה ברגע שמנהל יאשר אותך.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            התנתק
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
