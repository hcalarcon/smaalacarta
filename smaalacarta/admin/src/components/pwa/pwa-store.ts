import { useSyncExternalStore } from "react";

import {
  deletePushSubscriptionAction,
  hasPushSubscriptionAction,
  savePushSubscriptionAction,
} from "./actions";
import {
  PushSetupError,
  getSubscription,
  readEnvironment,
  registerServiceWorker,
  subscribeDevice,
  unsubscribeDevice,
  type BrowserEnvironment,
} from "./browser";
import { installControl, pushControl, shouldResubscribe, type DeviceState } from "@/lib/push/install";

// El estado de la app instalada y de los avisos de este aparato, compartido por todos los botones del
// panel (el del header y el recuadro del repartidor). Un solo lugar para que activar en uno se vea en el
// otro, y para no perder el `beforeinstallprompt` si el navegador lo dispara antes de que se pinte el botón.

export type PwaSnapshot = {
  // Nulo hasta medir el navegador (en el servidor y en el primer pintado no hay nada que mostrar).
  env: BrowserEnvironment | null;
  canPromptInstall: boolean;
  installed: boolean;
  subscribed: boolean;
  // La dirección de la suscripción de este aparato, si la cuenta actual la tiene (para sacarla al salir).
  endpoint: string | null;
  busy: boolean;
  error: string | null;
};

const INITIAL: PwaSnapshot = {
  env: null,
  canPromptInstall: false,
  installed: false,
  subscribed: false,
  endpoint: null,
  busy: false,
  error: null,
};

type InstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let snapshot: PwaSnapshot = INITIAL;
let deferredPrompt: InstallPromptEvent | null = null;
let started = false;
// Un solo intento de volver a suscribir solo por carga (ADMIN-PWA-38): si falla, la próxima vez que abra se reintenta.
let resubscribeTried = false;
const OPT_OUT_KEY = "sma-push-off";

// Quien desactivó los avisos a propósito no se vuelve a suscribir solo.
function optedOut(): boolean {
  try {
    return localStorage.getItem(OPT_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

function saveOptOut(off: boolean) {
  try {
    if (off) localStorage.setItem(OPT_OUT_KEY, "1");
    else localStorage.removeItem(OPT_OUT_KEY);
  } catch {
    // Modo privado: sin la marca, la próxima carga puede volver a suscribir.
  }
}
const listeners = new Set<() => void>();

function set(patch: Partial<PwaSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((listener) => listener());
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getSnapshot = () => snapshot;
export const getServerSnapshot = () => INITIAL;

// Vuelve a medir el aparato y a preguntar si está suscripto a la cuenta actual. El navegador puede seguir
// suscripto de otra cuenta que usó el mismo aparato: solo cuenta si la base lo tiene en esta (ADMIN-PWA-28).
export async function refresh() {
  const env = readEnvironment();
  set({ env });

  if (!env.hasServiceWorker || !env.hasPushManager || env.permission !== "granted") {
    set({ subscribed: false, endpoint: null });
    return;
  }

  try {
    const subscription = await getSubscription();
    const mine = subscription ? await hasPushSubscriptionAction(subscription.endpoint) : false;
    set({ subscribed: mine, endpoint: mine && subscription ? subscription.endpoint : null });

    const device: DeviceState = {
      ...env,
      installed: snapshot.installed,
      canPromptInstall: snapshot.canPromptInstall,
      subscribed: mine,
    };

    if (!resubscribeTried && !optedOut() && shouldResubscribe(device)) {
      resubscribeTried = true;
      await resubscribeSilently();
    }
  } catch {
    set({ subscribed: false, endpoint: null });
  }
}

// El permiso ya está concedido: suscribe y guarda en la cuenta sin preguntar nada. Si algo falla, queda como estaba
// y el botón "Activar avisos" sigue ahí.
async function resubscribeSilently() {
  try {
    const subscription = await subscribeDevice();
    const saved = await savePushSubscriptionAction(subscription);
    if (saved.ok) set({ subscribed: true, endpoint: subscription.endpoint ?? null });
  } catch {
    // Sin avisos por ahora; no se le muestra nada al usuario.
  }
}

// Idempotente: los layouts lo llaman al montar. Registra el service worker y se queda mirando la
// instalación y la vuelta a la pestaña (el permiso se puede cambiar desde los ajustes del navegador).
export function start() {
  if (started || typeof window === "undefined") return;
  started = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    // Sin esto Chrome muestra su propio cartel: la instalación es explícita, con el botón.
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    set({ canPromptInstall: true });
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    set({ installed: true, canPromptInstall: false });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void refresh();
  });

  void registerServiceWorker().then(refresh);
}

export async function promptInstall() {
  const prompt = deferredPrompt;
  if (!prompt) return;

  // El evento solo sirve una vez.
  deferredPrompt = null;
  set({ canPromptInstall: false });

  await prompt.prompt();
  const choice = await prompt.userChoice;

  if (choice.outcome === "accepted") set({ installed: true });
}

const ERRORS = {
  denied: "El permiso de avisos quedó bloqueado: habilitalo en los ajustes del navegador.",
  dismissed: "No diste el permiso: tocá de nuevo para activar los avisos.",
  unsupported: "Este navegador no permite avisos.",
  "no-key": "Los avisos todavía no están configurados.",
} as const;

// Pide el permiso, suscribe y guarda en la cuenta. Siempre desde un toque (ADMIN-PWA-13).
export async function enablePush() {
  set({ busy: true, error: null });
  saveOptOut(false);

  try {
    const subscription = await subscribeDevice();
    const saved = await savePushSubscriptionAction(subscription);

    if (!saved.ok) {
      set({ busy: false, error: saved.error });
      return;
    }

    set({ busy: false, subscribed: true });
    await refresh();
  } catch (error) {
    set({
      busy: false,
      error: error instanceof PushSetupError ? ERRORS[error.reason] : "No pudimos activar los avisos. Probá de nuevo.",
    });
    await refresh();
  }
}

export async function disablePush() {
  set({ busy: true, error: null });
  saveOptOut(true);

  try {
    const endpoint = await unsubscribeDevice();
    if (endpoint) await deletePushSubscriptionAction(endpoint);

    set({ busy: false, subscribed: false, endpoint: null });
  } catch {
    set({ busy: false, error: "No pudimos desactivar los avisos. Probá de nuevo." });
  }
}

export function usePwa() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const device: DeviceState | null = state.env
    ? {
        ...state.env,
        installed: state.installed,
        canPromptInstall: state.canPromptInstall,
        subscribed: state.subscribed,
      }
    : null;

  return {
    ...state,
    installControl: device ? installControl(device) : ("hidden" as const),
    pushControl: device ? pushControl(device) : ("hidden" as const),
  };
}

// Solo para los tests: vuelve al estado de recién cargado.
export function resetForTests() {
  snapshot = INITIAL;
  deferredPrompt = null;
  started = false;
  resubscribeTried = false;
  listeners.clear();
}
