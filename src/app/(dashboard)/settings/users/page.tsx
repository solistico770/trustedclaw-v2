"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type UserProfile = {
  id: string;
  role: string;
  display_name: string | null;
  email: string;
  created_at: string;
};

const ROLE_STYLE: Record<string, { color: string; label: string }> = {
  admin: { color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400", label: "Admin" },
  pending: { color: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400", label: "Pending" },
  blocked: { color: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400", label: "Blocked" },
};

export default function UsersPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await (await fetch("/api/users")).json();
    if (Array.isArray(data)) setUsers(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function changeRole(userId: string, role: string) {
    await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, role }),
    });
    load();
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage who has access to TrustedClaw. First user is admin automatically.</p>
      </div>

      {loading ? (
        <div className="space-y-2 animate-pulse">{[1, 2].map(i => <div key={i} className="h-16 rounded-xl bg-card" />)}</div>
      ) : users.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-8">No users yet</p>
      ) : (
        <div className="space-y-2">
          {users.map(u => {
            const style = ROLE_STYLE[u.role] || ROLE_STYLE.pending;
            return (
              <Card key={u.id} className="border-border/50">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                    {u.email.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{u.display_name || u.email}</span>
                      <Badge className={`text-[10px] ${style.color}`}>{style.label}</Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{u.email} · {new Date(u.created_at).toLocaleDateString("he-IL")}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {u.role === "pending" && (
                      <Button size="sm" className="h-7 text-[11px] bg-emerald-600 hover:bg-emerald-500" onClick={() => changeRole(u.id, "admin")}>
                        Make Admin
                      </Button>
                    )}
                    {u.role === "blocked" && (
                      <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => changeRole(u.id, "pending")}>
                        Unblock
                      </Button>
                    )}
                    {u.role !== "blocked" && u.role !== "admin" && (
                      <Button size="sm" variant="ghost" className="h-7 text-[11px] text-destructive" onClick={() => changeRole(u.id, "blocked")}>
                        Block
                      </Button>
                    )}
                    {u.role === "admin" && (
                      <span className="text-[10px] text-muted-foreground px-2 py-1">Admin</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
