import { useCallback, useSyncExternalStore } from "react";

type Listener = () => void;
const listeners = new Set<Listener>();

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitChange() {
  listeners.forEach((listener) => listener());
}

function getServerSnapshot() {
  return null;
}

/** Synchronizes React state with `localStorage[key]` via useSyncExternalStore (SSR-safe, no effect-driven setState). */
export function useLocalStorage<T>(key: string, initialValue: T) {
  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(key);
  }, [key]);

  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  let value = initialValue;
  if (raw) {
    try {
      value = JSON.parse(raw) as T;
    } catch {
      value = initialValue;
    }
  }

  const setValue = useCallback(
    (updater: T | ((prev: T) => T)) => {
      let current = initialValue;
      const currentRaw = window.localStorage.getItem(key);
      if (currentRaw) {
        try {
          current = JSON.parse(currentRaw) as T;
        } catch {
          current = initialValue;
        }
      }
      const next = typeof updater === "function" ? (updater as (prev: T) => T)(current) : updater;
      window.localStorage.setItem(key, JSON.stringify(next));
      emitChange();
    },
    [key, initialValue]
  );

  return [value, setValue] as const;
}
