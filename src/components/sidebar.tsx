"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Cases", icon: "📋" },
  { href: "/entities", label: "Entities", icon: "👤" },
  { href: "/simulate", label: "Simulate", icon: "🧪" },
  { href: "/scan-monitor", label: "Scan Monitor", icon: "🔍" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export function Sidebar({ caseCount }: { caseCount?: number }) {
  const pathname = usePathname();
  return (
    <aside className="w-52 bg-zinc-950 border-l border-zinc-800 flex flex-col py-4 h-screen sticky top-0">
      <div className="px-4 mb-6">
        <h1 className="text-lg font-bold text-white">TrustedClaw</h1>
        <p className="text-xs text-zinc-500">v2 — Case Agent</p>
      </div>
      <nav className="flex-1 space-y-1 px-2">
        {nav.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}
              className={cn("flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                active ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white hover:bg-zinc-900")}>
              <span>{item.icon}</span>
              <span>{item.label}</span>
              {item.href === "/" && caseCount ? (
                <span className="mr-auto bg-red-600 text-white text-xs px-1.5 py-0.5 rounded-full">{caseCount}</span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
