"use client";

import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase-browser";
import { LogOut, ChevronUp, Settings, Cpu, FlaskConical, UserCog, Send, Radio } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import Link from "next/link";
import {
  Sidebar, SidebarContent, SidebarFooter,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarGroup, SidebarGroupContent,
} from "@/components/ui/sidebar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

// Secondary nav items that don't belong in the main toolbar
const secondaryNav = [
  { href: "/wa-control", label: "WA Control", icon: Radio },
  { href: "/simulate", label: "Simulate", icon: FlaskConical },
  { href: "/scan-monitor", label: "Scanner", icon: Cpu },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/settings/users", label: "Users", icon: UserCog },
  { href: "/settings?tab=telegram", label: "Telegram Bot", icon: Send },
];

function deployAge() {
  const bt = process.env.NEXT_PUBLIC_BUILD_TIME;
  if (!bt) return "";
  const min = Math.round((Date.now() - new Date(bt).getTime()) / 60000);
  if (min < 1) return "<1m";
  if (min < 60) return `${min}m`;
  if (min < 1440) return `${Math.round(min / 60)}h`;
  return `${Math.round(min / 1440)}d`;
}

export function AppSidebar({ userEmail }: { caseCount?: number; userEmail?: string }) {
  const router = useRouter();
  const supabase = createBrowserClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const initials = userEmail ? userEmail.slice(0, 2).toUpperCase() : "TC";
  const gitSha = process.env.NEXT_PUBLIC_GIT_SHA || "???";
  const age = deployAge();

  return (
    <Sidebar side="right" collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center text-primary text-xs font-bold shrink-0">TC</div>
          <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
            <h1 className="text-sm font-semibold tracking-tight">TrustedClaw</h1>
            <p className="text-[10px] text-muted-foreground truncate">Operational Agent</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {secondaryNav.map(item => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton tooltip={item.label} render={<Link href={item.href} />}>
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuButton />}>
                <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center text-primary text-[10px] font-bold shrink-0">{initials}</div>
                <div className="flex-1 min-w-0">
                  <span className="truncate text-xs block">{userEmail || "Admin"}</span>
                  <span className="text-[9px] text-muted-foreground font-mono">{gitSha}{age ? ` · ${age}` : ""}</span>
                </div>
                <ChevronUp className="mr-auto" />
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" className="w-[--radix-dropdown-menu-trigger-width]">
                <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs">Theme</span>
                    <ThemeToggle />
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onSelect={handleLogout}>
                  <LogOut className="w-4 h-4" />
                  <span>Logout</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
