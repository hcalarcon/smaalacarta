import { useCallback, useSyncExternalStore } from "react";

// Un sí/no que el navegador recuerda en `localStorage` (ADMIN-CONFIG-38). Es una comodidad de cada
// persona: si el almacenamiento no está disponible (ventana privada, datos bloqueados) todo sigue
// andando con el valor por defecto, y el servidor siempre renderiza ese valor.
const listeners = new Set<() => void>();
// Respaldo en memoria para cuando `localStorage` no deja escribir.
const memory = new Map<string, boolean>();

function read(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    return raw === "1" ? true : raw === "0" ? false : fallback;
  } catch {
    // Sin almacenamiento: se usa la memoria de esta pestaña.
    return memory.get(key) ?? fallback;
  }
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

export function useStoredFlag(key: string, fallback: boolean) {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key, fallback),
    () => fallback,
  );

  const set = useCallback(
    (next: boolean) => {
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {
        // Se queda en memoria.
        memory.set(key, next);
      }
      listeners.forEach((listener) => listener());
    },
    [key],
  );

  return [value, set] as const;
}
