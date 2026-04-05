"use client";

import { createContext, useContext, useCallback, useState, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/* ── Types ── */
type DrawerEntry = {
  id: string;
  title: string;
  content: ReactNode;
  width?: number; // px, default 600
};

type DrawerStackCtx = {
  stack: DrawerEntry[];
  openDrawer: (entry: DrawerEntry) => void;
  closeDrawer: (id?: string) => void;
  closeAllDrawers: () => void;
};

const DrawerCtx = createContext<DrawerStackCtx | null>(null);

export function useDrawerStack() {
  const ctx = useContext(DrawerCtx);
  if (!ctx) throw new Error("useDrawerStack must be used within DrawerStackProvider");
  return ctx;
}

/* ── Provider ── */
const MAX_DEPTH = 3;

export function DrawerStackProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<DrawerEntry[]>([]);

  const openDrawer = useCallback((entry: DrawerEntry) => {
    setStack(prev => {
      // If already open, bring to top
      const filtered = prev.filter(d => d.id !== entry.id);
      // Cap at MAX_DEPTH: if full, drop the oldest
      const base = filtered.length >= MAX_DEPTH ? filtered.slice(1) : filtered;
      return [...base, entry];
    });
  }, []);

  const closeDrawer = useCallback((id?: string) => {
    setStack(prev => {
      if (!id) return prev.slice(0, -1); // close topmost
      return prev.filter(d => d.id !== id);
    });
  }, []);

  const closeAllDrawers = useCallback(() => setStack([]), []);

  return (
    <DrawerCtx.Provider value={{ stack, openDrawer, closeDrawer, closeAllDrawers }}>
      {children}
      {stack.length > 0 && <DrawerOverlay stack={stack} onClose={closeDrawer} onCloseAll={closeAllDrawers} />}
    </DrawerCtx.Provider>
  );
}

/* ── Overlay + Panels ── */
function DrawerOverlay({ stack, onClose, onCloseAll }: {
  stack: DrawerEntry[];
  onClose: (id?: string) => void;
  onCloseAll: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  // Detect RTL
  const isRtl = typeof document !== "undefined" && document.documentElement.dir === "rtl";

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100] bg-black/40 transition-opacity"
        style={{ opacity: stack.length > 0 ? 1 : 0, transitionDuration: "var(--duration-normal)" }}
        onClick={() => onClose()}
        aria-hidden
      />
      {/* Drawer panels */}
      {stack.map((entry, idx) => (
        <DrawerPanel
          key={entry.id}
          entry={entry}
          index={idx}
          total={stack.length}
          isRtl={isRtl}
          isTop={idx === stack.length - 1}
          onClose={() => onClose(entry.id)}
        />
      ))}
    </>,
    document.body
  );
}

function DrawerPanel({ entry, index, total, isRtl, isTop, onClose }: {
  entry: DrawerEntry;
  index: number;
  total: number;
  isRtl: boolean;
  isTop: boolean;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);
  const [visible, setVisible] = useState(false);

  // Capture the element that triggered this drawer for focus return
  useEffect(() => {
    triggerRef.current = document.activeElement;
    // Animate in
    requestAnimationFrame(() => setVisible(true));
    return () => {
      // Return focus on unmount
      if (triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus();
      }
    };
  }, []);

  // Focus trap: focus the panel when it becomes the top drawer
  useEffect(() => {
    if (isTop && panelRef.current) {
      panelRef.current.focus();
    }
  }, [isTop]);

  // Escape key closes topmost
  useEffect(() => {
    if (!isTop) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isTop, onClose]);

  // Calculate offset for stacking (deeper drawers shift away)
  const depth = total - 1 - index; // 0 for topmost
  const offsetPx = depth * 24;
  const width = entry.width || 600;

  // Mobile: full width
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const panelWidth = isMobile ? "100vw" : `min(${width}px, 80vw)`;

  // Position: RTL = left side, LTR = right side
  const slideFrom = isRtl ? "left" : "right";
  const translateHidden = isRtl ? "-100%" : "100%";
  const translateVisible = isRtl ? `${offsetPx}px` : `-${offsetPx}px`;

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={entry.title}
      className="fixed inset-y-0 z-[101] flex flex-col glass-panel border-border/50 shadow-2xl outline-none"
      style={{
        width: panelWidth,
        [slideFrom]: 0,
        transform: visible ? `translateX(${translateVisible})` : `translateX(${translateHidden})`,
        transition: `transform var(--duration-normal) var(--ease-out-expo)`,
        zIndex: 101 + index,
        borderLeft: isRtl ? "none" : "1px solid var(--border)",
        borderRight: isRtl ? "1px solid var(--border)" : "none",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border/50 shrink-0">
        <h2 className="text-sm font-bold text-foreground flex-1 truncate">{entry.title}</h2>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <XIcon className="w-4 h-4" />
          <span className="sr-only">Close</span>
        </Button>
      </div>
      {/* Content — scrollable */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {entry.content}
      </div>
    </div>
  );
}
