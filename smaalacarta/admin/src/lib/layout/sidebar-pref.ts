// Si el menú lateral está achicado a solo íconos (ADMIN-PEDIDOS-56). Vive en el navegador de cada persona:
// una preferencia, no un dato. Todo acceso al almacenamiento va con try/catch (modo privado, bloqueado).

export const SIDEBAR_KEY = "sma.sidebar.collapsed";

const listeners = new Set<() => void>();

export function readCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeCollapsed(value: boolean) {
  try {
    localStorage.setItem(SIDEBAR_KEY, value ? "1" : "0");
  } catch {
    // Sin almacenamiento, el cambio vale solo para esta visita.
  }
  listeners.forEach((listener) => listener());
}

// Para `useSyncExternalStore`: avisa en esta pestaña y en las otras.
export function subscribeCollapsed(onChange: () => void) {
  listeners.add(onChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key === SIDEBAR_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}
