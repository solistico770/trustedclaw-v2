// Scan interval matrix: [urgency][importance] → seconds until next scan
// Both scales: 1 = most critical, 5 = routine
// Note: even 4 is "important" — don't let anything go too long
//
// The agent can ALWAYS override with set_next_scan command.
// This matrix is the DEFAULT when agent doesn't override.

const MATRIX: number[][] = [
  //  imp1     imp2     imp3     imp4     imp5
  [   300,     600,     900,    1800,    3600],     // urg 1 — 5m, 10m, 15m, 30m, 1h
  [   600,     900,    1800,    3600,    7200],     // urg 2 — 10m, 15m, 30m, 1h, 2h
  [   900,    1800,    3600,    7200,   14400],     // urg 3 — 15m, 30m, 1h, 2h, 4h
  [  1800,    3600,    7200,   14400,   28800],     // urg 4 — 30m, 1h, 2h, 4h, 8h
  [  3600,    7200,   14400,   28800,   86400],     // urg 5 — 1h, 2h, 4h, 8h, 24h
];

export function getScanIntervalSeconds(urgency: number, importance: number): number {
  const u = Math.max(1, Math.min(5, urgency)) - 1;
  const i = Math.max(1, Math.min(5, importance)) - 1;
  return MATRIX[u][i];
}

export function getScanIntervalLabel(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

export const URGENCY_LABELS: Record<number, string> = {
  1: "Critical", 2: "High", 3: "Medium", 4: "Important", 5: "Routine",
};

export const IMPORTANCE_LABELS: Record<number, string> = {
  1: "Critical", 2: "High", 3: "Medium", 4: "Important", 5: "Routine",
};

export const LEVEL_COLORS: Record<number, { text: string; bg: string }> = {
  1: { text: "text-red-600 dark:text-red-400", bg: "bg-red-100 dark:bg-red-500/15" },
  2: { text: "text-orange-600 dark:text-orange-400", bg: "bg-orange-100 dark:bg-orange-500/15" },
  3: { text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-500/15" },
  4: { text: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-500/15" },
  5: { text: "text-zinc-500", bg: "bg-zinc-100 dark:bg-zinc-500/15" },
};
