"use client";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [caseCount, setCaseCount] = useState(0);
  const [userEmail, setUserEmail] = useState<string | undefined>();
  const supabase = createBrowserClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setUserEmail(user.email || undefined);

      const { count } = await supabase.from("cases").select("*", { count: "exact", head: true })
        .eq("user_id", user.id).not("status", "in", '("closed","merged")');
      setCaseCount(count || 0);
    }
    load();
    const ch = supabase.channel("case-count").on("postgres_changes", { event: "*", schema: "public", table: "cases" }, () => load()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [supabase]);

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar caseCount={caseCount} userEmail={userEmail} />
        <SidebarInset>
          <header className="flex h-12 items-center gap-2 border-b border-border px-4">
            <SidebarTrigger />
          </header>
          <main className="p-6 max-w-5xl mx-auto">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
