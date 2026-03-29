"use client";
import { Sidebar } from "@/components/sidebar";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { DEMO_USER_ID } from "@/lib/constants";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [caseCount, setCaseCount] = useState(0);
  const supabase = createBrowserClient();

  useEffect(() => {
    async function fetch() {
      const { count } = await supabase.from("cases").select("*", { count: "exact", head: true })
        .eq("user_id", DEMO_USER_ID).not("status", "in", '("closed","merged")');
      setCaseCount(count || 0);
    }
    fetch();
    const ch = supabase.channel("case-count").on("postgres_changes", { event: "*", schema: "public", table: "cases" }, () => fetch()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [supabase]);

  return (
    <div className="flex min-h-screen bg-zinc-950 text-white" dir="rtl">
      <div className="flex-1 overflow-auto"><main className="p-6 max-w-5xl mx-auto">{children}</main></div>
      <Sidebar caseCount={caseCount} />
    </div>
  );
}
