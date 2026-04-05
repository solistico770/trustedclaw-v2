"use client";
import { useEffect, useState, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DrawerStackProvider } from "@/components/drawer-stack";
import { WorkspaceToolbar } from "@/components/workspace-toolbar";

function fmtSec(s: number) { return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`; }

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [caseCount, setCaseCount] = useState(0);
  const [userEmail, setUserEmail] = useState<string | undefined>();
  const [scanner, setScanner] = useState<{ lastAgo: string; next: string; today: number } | undefined>();
  const supabase = createBrowserClient();

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserEmail(user.email || undefined);

    const { count } = await supabase.from("cases").select("*", { count: "exact", head: true })
      .eq("user_id", user.id).not("status", "in", '("closed","merged")');
    setCaseCount(count || 0);

    // Fetch scanner status for toolbar
    try {
      const res = await fetch("/api/dashboard");
      if (res.ok) {
        const d = await res.json();
        if (d.scanner) {
          setScanner({
            lastAgo: d.scanner.last_scan_ago_sec != null ? fmtSec(d.scanner.last_scan_ago_sec) + " ago" : "—",
            next: d.scanner.next_scan_in_sec != null ? fmtSec(d.scanner.next_scan_in_sec) : "—",
            today: d.scanner.cases_scanned_today || 0,
          });
        }
      }
    } catch {}
  }, [supabase]);

  useEffect(() => {
    load();
    const ch = supabase.channel("case-count").on("postgres_changes", { event: "*", schema: "public", table: "cases" }, () => load()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [supabase, load]);

  return (
    <TooltipProvider>
      <DrawerStackProvider>
        <SidebarProvider>
          <AppSidebar caseCount={caseCount} userEmail={userEmail} />
          <SidebarInset>
            {/* Workspace shell: toolbar + scrollable main */}
            <div className="flex flex-col h-[100dvh]">
              {/* Toolbar with tabs */}
              <div className="flex items-center shrink-0">
                <div className="p-1.5 pl-2">
                  <SidebarTrigger />
                </div>
                <div className="flex-1 min-w-0">
                  <WorkspaceToolbar scannerStatus={scanner} caseCount={caseCount} />
                </div>
              </div>
              {/* Main content — bounded scroll */}
              <main className="flex-1 overflow-y-auto overflow-x-hidden">
                <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
                  {children}
                </div>
              </main>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </DrawerStackProvider>
    </TooltipProvider>
  );
}
