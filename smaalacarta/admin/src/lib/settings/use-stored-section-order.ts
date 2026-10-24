"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import { orderSettingsSections, parseSectionOrder } from "./section-order";
import type { SettingsSection } from "./sections";

const listeners = new Map<string, Set<() => void>>();
const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function subscribe(key: string, callback: () => void) {
  const subscribers = listeners.get(key) ?? new Set<() => void>();
  subscribers.add(callback);
  listeners.set(key, subscribers);

  const onStorage = (event: StorageEvent) => {
    if (event.key === key || event.key === null) callback();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    subscribers.delete(callback);
    if (subscribers.size === 0) listeners.delete(key);
    window.removeEventListener("storage", onStorage);
  };
}

export function useStoredSectionOrder(sections: SettingsSection[], businessId: string) {
  const key = `sma:settings-section-order:${businessId}`;
  const subscribeToOrder = useCallback((callback: () => void) => subscribe(key, callback), [key]);
  const readOrder = useCallback(() => read(key), [key]);
  const storedOrder = useSyncExternalStore(subscribeToOrder, readOrder, () => null);
  const orderedSections = useMemo(
    () => orderSettingsSections(sections, parseSectionOrder(storedOrder)),
    [sections, storedOrder],
  );

  const saveOrder = useCallback(
    (ids: string[]) => {
      const value = JSON.stringify(ids);
      try {
        localStorage.setItem(key, value);
      } catch {
        memory.set(key, value);
      }
      listeners.get(key)?.forEach((listener) => listener());
    },
    [key],
  );

  return [orderedSections, saveOrder] as const;
}
