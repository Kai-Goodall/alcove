"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "alcove.anthropicApiKey";
const listeners = new Set<() => void>();
// In-memory fallback so the key still works for the session when storage is
// unavailable (private mode etc.).
let memoryKey = "";

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function getSnapshot(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? memoryKey;
  } catch {
    return memoryKey;
  }
}

/**
 * Client-stored Anthropic API key for the optional AI features (deep search
 * enrichment + the assistant chat). The key lives in localStorage only — it is
 * sent per-request to this app's own API routes and never persisted server
 * side, so a self-hosted deployment works without configuring any server env.
 * Server-side ANTHROPIC_API_KEY (when set) is used as a fallback.
 */
export function useAnthropicKey() {
  const key = useSyncExternalStore(subscribe, getSnapshot, () => "");

  const setKey = useCallback((value: string) => {
    memoryKey = value;
    try {
      if (value) window.localStorage.setItem(STORAGE_KEY, value);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage unavailable; the in-memory copy still serves this session.
    }
    listeners.forEach((listener) => listener());
  }, []);

  return { key, setKey };
}
