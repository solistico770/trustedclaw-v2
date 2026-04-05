"use client";
import { useEffect, useState, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterBar, useFilterState, type FilterPill } from "@/components/filter-bar";
import { TasksPanel } from "@/components/tasks-panel";

export default function TasksPage() {
  const [cases, setCases] = useState<Array<{ id: string; case_number: number; title: string }>>([]);
  const [filterState, setFilterState] = useFilterState();

  useEffect(() => {
    fetch("/api/cases").then(r => r.json()).then(data => {
      const arr = data?.data || (Array.isArray(data) ? data : []);
      setCases(arr.map((c: { id: string; case_number: number; title: string }) => ({ id: c.id, case_number: c.case_number, title: c.title })));
    });
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-bold tracking-tight">Tasks</h1>
      </div>
      <TasksPanel cases={cases} />
    </div>
  );
}
