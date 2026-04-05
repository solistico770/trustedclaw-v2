"use client";

import { useState, useRef, useCallback } from "react";

type EC2QueryState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  stale: boolean;
};

type EC2QueryResult<T> = EC2QueryState<T> & {
  execute: (action: string, params?: Record<string, unknown>) => Promise<T | null>;
};

const POLL_INTERVAL = 1500;
const POLL_TIMEOUT = 30000;

export function useEC2Query<T = Record<string, unknown>>(): EC2QueryResult<T> {
  const [state, setState] = useState<EC2QueryState<T>>({
    data: null,
    loading: false,
    error: null,
    stale: false,
  });
  const activeCommandRef = useRef<string | null>(null);

  const execute = useCallback(async (action: string, params?: Record<string, unknown>): Promise<T | null> => {
    // Mark previous data as stale
    setState(prev => ({
      ...prev,
      loading: true,
      error: null,
      stale: prev.data !== null,
    }));

    try {
      // Dispatch command
      const res = await fetch("/api/ec2-db", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, params }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const { command_id } = await res.json();
      activeCommandRef.current = command_id;

      // Poll for response
      const pollStart = Date.now();
      while (Date.now() - pollStart < POLL_TIMEOUT) {
        // Check if this command was superseded
        if (activeCommandRef.current !== command_id) return null;

        const pollRes = await fetch(`/api/listener/response?command_id=${command_id}`);
        const pollData = await pollRes.json();

        if (pollData?.data) {
          // Check again after receiving
          if (activeCommandRef.current !== command_id) return null;

          const result = pollData.data as T;
          setState({ data: result, loading: false, error: null, stale: false });
          return result;
        }

        await new Promise(r => setTimeout(r, POLL_INTERVAL));
      }

      // Timeout
      if (activeCommandRef.current === command_id) {
        setState(prev => ({
          ...prev,
          loading: false,
          error: "EC2 did not respond within 30s. The listener may be offline.",
          stale: prev.data !== null,
        }));
      }
      return null;
    } catch (err) {
      if (activeCommandRef.current) {
        setState(prev => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : String(err),
          stale: prev.data !== null,
        }));
      }
      return null;
    }
  }, []);

  return { ...state, execute };
}
