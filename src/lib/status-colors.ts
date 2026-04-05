/* Canonical status color definitions — use these everywhere for consistency */

export const CASE_STATUS = {
  open:          { label: "Open",          dot: "bg-blue-500",    text: "text-blue-600 dark:text-blue-400",    bg: "bg-blue-500/10 text-blue-700 dark:text-blue-400",    border: "border-blue-500/20" },
  action_needed: { label: "Action Needed", dot: "bg-red-500",     text: "text-red-600 dark:text-red-400",      bg: "bg-red-500/10 text-red-700 dark:text-red-400",       border: "border-red-500/20" },
  in_progress:   { label: "In Progress",   dot: "bg-violet-500",  text: "text-violet-600 dark:text-violet-400",bg: "bg-violet-500/10 text-violet-700 dark:text-violet-400", border: "border-violet-500/20" },
  addressed:     { label: "Addressed",     dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", border: "border-emerald-500/20" },
  scheduled:     { label: "Scheduled",     dot: "bg-cyan-500",    text: "text-cyan-600 dark:text-cyan-400",    bg: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400",    border: "border-cyan-500/20" },
  escalated:     { label: "Escalated",     dot: "bg-red-600",     text: "text-red-700 dark:text-red-300",      bg: "bg-red-500/15 text-red-700 dark:text-red-400",       border: "border-red-500/30" },
  closed:        { label: "Closed",        dot: "bg-zinc-400",    text: "text-zinc-500",                        bg: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",    border: "border-zinc-500/20" },
} as const;

export const SIGNAL_STATUS = {
  pending:   { label: "Pending",   dot: "bg-amber-500",   bg: "bg-amber-500/10 text-amber-700 dark:text-amber-400",     border: "border-amber-500/20" },
  processed: { label: "Processed", dot: "bg-emerald-500", bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", border: "border-emerald-500/20" },
  ignored:   { label: "Ignored",   dot: "bg-zinc-400",    bg: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",         border: "border-zinc-500/20" },
} as const;

export const TASK_STATUS = {
  open:   { label: "Open",   dot: "bg-blue-500",    text: "text-blue-600 dark:text-blue-400" },
  closed: { label: "Done",   dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
} as const;

export const ENTITY_TYPE = {
  person:  { label: "Person",  bg: "bg-blue-500/10 text-blue-700 dark:text-blue-400",       border: "border-blue-500/20",    icon: "PE" },
  company: { label: "Company", bg: "bg-violet-500/10 text-violet-700 dark:text-violet-400", border: "border-violet-500/20",  icon: "CO" },
  project: { label: "Project", bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", border: "border-emerald-500/20", icon: "PR" },
  invoice: { label: "Invoice", bg: "bg-amber-500/10 text-amber-700 dark:text-amber-400",    border: "border-amber-500/20",   icon: "IN" },
  other:   { label: "Other",   bg: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",        border: "border-zinc-500/20",    icon: "OT" },
} as const;

export const URGENCY_BG: Record<number, string> = {
  1: "bg-red-500 text-white",
  2: "bg-orange-500 text-white",
  3: "bg-amber-500 text-white",
  4: "bg-blue-500 text-white",
  5: "bg-zinc-400 text-white",
};

export const GATE_TYPE = {
  whatsapp: { short: "WA", bg: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  telegram: { short: "TG", bg: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  email:    { short: "EM", bg: "bg-orange-500/15 text-orange-700 dark:text-orange-400" },
  slack:    { short: "SL", bg: "bg-purple-500/15 text-purple-700 dark:text-purple-400" },
} as const;
