"use client";

import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, ClipboardList, Radio, CheckSquare, Users, ClipboardCheck } from "lucide-react";

const TABS = [
  { href: "/",         label: "Dashboard", icon: LayoutDashboard },
  { href: "/cases",    label: "Cases",     icon: ClipboardList },
  { href: "/signals",  label: "Signals",   icon: Radio },
  { href: "/tasks",    label: "Tasks",     icon: CheckSquare },
  { href: "/cheds",    label: "Cheds",     icon: ClipboardCheck },
  { href: "/entities", label: "Entities",  icon: Users },
] as const;

export function WorkspaceToolbar({ scannerStatus, caseCount }: {
  scannerStatus?: { lastAgo: string; next: string; today: number };
  caseCount?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="flex items-center gap-1 px-3 h-11 border-b border-border/50 bg-card/80 backdrop-blur-sm shrink-0 overflow-x-auto">
      {/* Workspace tabs */}
      <nav className="flex items-center gap-0.5">
        {TABS.map(tab => {
          const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <button
              key={tab.href}
              onClick={() => router.push(tab.href)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {tab.href === "/cases" && caseCount ? (
                <span className="bg-primary/20 text-primary text-[10px] font-bold px-1.5 rounded-full">{caseCount}</span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="flex-1" />

      {/* Live pulse */}
      <div className="flex items-center gap-1.5 px-2">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">Live</span>
      </div>

      {/* Scanner status */}
      {scannerStatus && (
        <div className="hidden sm:flex items-center gap-2 text-[10px] text-muted-foreground px-2 border-r border-border/30 mr-1">
          <span>Scan {scannerStatus.lastAgo}</span>
          <span className="text-foreground/20">|</span>
          <span>Next {scannerStatus.next}</span>
          <span className="text-foreground/20">|</span>
          <span>{scannerStatus.today}/day</span>
        </div>
      )}
    </div>
  );
}
