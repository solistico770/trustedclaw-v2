"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/* ── Types ── */
export type FilterPill = {
  key: string;
  label: string;
  color?: string; // tailwind classes for active state
  count?: number;
};

export type SortColumn = {
  key: string;
  label: string;
};

export type SortState = { key: string; dir: "asc" | "desc" }[];

export type FilterBarConfig = {
  viewKey: string; // for localStorage presets + URL sync
  pills?: FilterPill[];
  sortColumns?: SortColumn[];
  searchPlaceholder?: string;
};

export type FilterState = {
  activePills: string[];
  search: string;
  sort: SortState;
};

const EMPTY_STATE: FilterState = { activePills: [], search: "", sort: [] };

/* ── Presets ── */
type Preset = { name: string; state: FilterState };

function loadPresets(viewKey: string): Preset[] {
  try {
    const raw = localStorage.getItem(`tc-filter-presets-${viewKey}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function savePresets(viewKey: string, presets: Preset[]) {
  localStorage.setItem(`tc-filter-presets-${viewKey}`, JSON.stringify(presets));
}

/* ── URL sync helpers ── */
function stateToParams(state: FilterState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.activePills.length) params.set("filter", state.activePills.join(","));
  if (state.search) params.set("q", state.search);
  if (state.sort.length) params.set("sort", state.sort.map(s => `${s.key}:${s.dir}`).join(","));
  return params;
}

function paramsToState(params: URLSearchParams): Partial<FilterState> {
  const result: Partial<FilterState> = {};
  const filter = params.get("filter");
  if (filter) result.activePills = filter.split(",");
  const q = params.get("q");
  if (q) result.search = q;
  const sort = params.get("sort");
  if (sort) result.sort = sort.split(",").map(s => {
    const [key, dir] = s.split(":");
    return { key, dir: dir === "desc" ? "desc" as const : "asc" as const };
  });
  return result;
}

/* ── Component ── */
export function FilterBar({
  config,
  state,
  onChange,
}: {
  config: FilterBarConfig;
  state: FilterState;
  onChange: (state: FilterState) => void;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Load presets
  useEffect(() => {
    setPresets(loadPresets(config.viewKey));
  }, [config.viewKey]);

  // Init from URL params on mount
  useEffect(() => {
    const fromUrl = paramsToState(searchParams);
    if (fromUrl.activePills || fromUrl.search || fromUrl.sort) {
      onChange({ ...EMPTY_STATE, ...fromUrl });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync state to URL
  const syncUrl = useCallback((newState: FilterState) => {
    const params = stateToParams(newState);
    const qs = params.toString();
    const newUrl = qs ? `${pathname}?${qs}` : pathname;
    router.replace(newUrl, { scroll: false });
  }, [pathname, router]);

  // Keyboard: / to focus search, Escape to clear
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape" && document.activeElement === searchRef.current) {
        const newState = { ...state, search: "" };
        onChange(newState);
        syncUrl(newState);
        searchRef.current?.blur();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [state, onChange, syncUrl]);

  function togglePill(key: string) {
    const active = state.activePills.includes(key)
      ? state.activePills.filter(k => k !== key)
      : [...state.activePills, key];
    const newState = { ...state, activePills: active };
    onChange(newState);
    syncUrl(newState);
  }

  function setSearch(search: string) {
    const newState = { ...state, search };
    onChange(newState);
    // Debounce URL sync for search
  }

  function toggleSort(key: string, shift: boolean) {
    const existing = state.sort.findIndex(s => s.key === key);
    let newSort: SortState;
    if (existing >= 0) {
      const current = state.sort[existing];
      if (current.dir === "asc") {
        newSort = [...state.sort];
        newSort[existing] = { key, dir: "desc" };
      } else {
        newSort = state.sort.filter((_, i) => i !== existing);
      }
    } else {
      if (shift) {
        newSort = [...state.sort, { key, dir: "asc" }];
      } else {
        newSort = [{ key, dir: "asc" }];
      }
    }
    const newState = { ...state, sort: newSort };
    onChange(newState);
    syncUrl(newState);
  }

  function clearAll() {
    onChange(EMPTY_STATE);
    syncUrl(EMPTY_STATE);
  }

  function savePreset() {
    const name = prompt("Preset name:");
    if (!name) return;
    const updated = [...presets.filter(p => p.name !== name), { name, state }];
    setPresets(updated);
    savePresets(config.viewKey, updated);
  }

  function loadPreset(preset: Preset) {
    onChange(preset.state);
    syncUrl(preset.state);
    setShowPresetMenu(false);
  }

  function deletePreset(name: string) {
    const updated = presets.filter(p => p.name !== name);
    setPresets(updated);
    savePresets(config.viewKey, updated);
  }

  const hasActive = state.activePills.length > 0 || state.search || state.sort.length > 0;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Search */}
      <div className="relative flex-1 max-w-xs min-w-[180px]">
        <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <Input
          ref={searchRef}
          placeholder={config.searchPlaceholder || "Search... (/)"}
          value={state.search}
          onChange={e => setSearch(e.target.value)}
          className="h-8 text-xs pr-9"
        />
      </div>

      {/* Filter pills */}
      {config.pills?.map(pill => {
        const active = state.activePills.includes(pill.key);
        return (
          <button key={pill.key} onClick={() => togglePill(pill.key)}
            className={`text-[11px] font-medium px-2.5 py-1 rounded-lg transition-all ${
              active
                ? (pill.color || "bg-primary/10 text-primary") + " ring-1 ring-current/20"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}>
            {pill.count != null && <span className="font-bold tabular-nums mr-1">{pill.count}</span>}
            {pill.label}
          </button>
        );
      })}

      {/* Sort controls */}
      {config.sortColumns && config.sortColumns.length > 0 && (
        <div className="flex items-center gap-1 border-r border-border/30 pr-2 mr-1">
          {config.sortColumns.map(col => {
            const sortEntry = state.sort.find(s => s.key === col.key);
            const sortIdx = state.sort.findIndex(s => s.key === col.key);
            return (
              <button key={col.key} onClick={(e) => toggleSort(col.key, e.shiftKey)}
                className={`text-[10px] font-medium px-2 py-1 rounded transition-all ${
                  sortEntry ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
                }`}>
                {col.label}
                {sortEntry && (
                  <span className="mr-0.5">
                    {sortEntry.dir === "asc" ? " ↑" : " ↓"}
                    {state.sort.length > 1 && <sup className="text-[8px]">{sortIdx + 1}</sup>}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Clear + Presets */}
      {hasActive && (
        <button onClick={clearAll} className="text-[10px] text-primary hover:underline">Clear</button>
      )}

      <div className="relative">
        <button onClick={() => setShowPresetMenu(!showPresetMenu)}
          className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-1 rounded hover:bg-muted/50">
          {presets.length > 0 ? `Presets (${presets.length})` : "Save"}
        </button>
        {showPresetMenu && (
          <div className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg p-1 min-w-[150px]">
            {hasActive && (
              <button onClick={savePreset} className="w-full text-right text-xs px-3 py-1.5 rounded hover:bg-muted/50 text-primary">
                Save current...
              </button>
            )}
            {presets.map(p => (
              <div key={p.name} className="flex items-center gap-1">
                <button onClick={() => loadPreset(p)} className="flex-1 text-right text-xs px-3 py-1.5 rounded hover:bg-muted/50">
                  {p.name}
                </button>
                <button onClick={() => deletePreset(p.name)} className="text-[10px] text-destructive px-1 hover:bg-destructive/10 rounded">x</button>
              </div>
            ))}
            {presets.length === 0 && !hasActive && (
              <p className="text-[10px] text-muted-foreground px-3 py-2">No presets</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Hook for easy usage ── */
export function useFilterState(initial?: Partial<FilterState>): [FilterState, React.Dispatch<React.SetStateAction<FilterState>>] {
  const [state, setState] = useState<FilterState>({ ...EMPTY_STATE, ...initial });
  return [state, setState];
}
