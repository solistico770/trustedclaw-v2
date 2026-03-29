"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase-browser";
import { ClipboardList, Users, FlaskConical, Cpu, Settings, LogOut, ChevronUp, UserCog } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarHeader, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const nav = [
  { href: "/", label: "Cases", icon: ClipboardList },
  { href: "/entities", label: "Entities", icon: Users },
  { href: "/simulate", label: "Simulate", icon: FlaskConical },
  { href: "/scan-monitor", label: "Scanner", icon: Cpu },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/settings/users", label: "Users", icon: UserCog },
];

export function AppSidebar({ caseCount, userEmail }: { caseCount?: number; userEmail?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createBrowserClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const initials = userEmail ? userEmail.slice(0, 2).toUpperCase() : "TC";

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
              {nav.map((item) => {
                const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={active}
                      tooltip={item.label}
                      render={<Link href={item.href} />}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                    {item.href === "/" && caseCount ? (
                      <SidebarMenuBadge>{caseCount}</SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                );
              })}
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
                <span className="truncate text-xs">{userEmail || "Admin"}</span>
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
