import { BASE_PATH } from "@/lib/base-path";
import { detectIOS, type NotificationPermissionState } from "@/lib/push/install";
import { urlBase64ToBytes } from "@/lib/push/vapid";

// Lo propio del navegador (service worker, Push API, permisos), en un solo lugar: la lógica de qué
// mostrar está en `src/lib/push/install.ts` y esto solo mide el aparato. Si el panel pasa a app nativa,
// se reemplaza este archivo.

export const SW_URL = `${BASE_PATH}/sw.js`;
export const SW_SCOPE = `${BASE_PATH}/`;

export type BrowserEnvironment = {
  isIOS: boolean;
  standalone: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  permission: NotificationPermissionState;
};

export function readEnvironment(): BrowserEnvironment {
  const nav = navigator as Navigator & { standalone?: boolean };

  return {
    isIOS: detectIOS(nav.userAgent, nav.platform, nav.maxTouchPoints ?? 0),
    standalone: window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true,
    hasServiceWorker: "serviceWorker" in navigator,
    hasPushManager: "PushManager" in window,
    permission: "Notification" in window ? Notification.permission : "unsupported",
  };
}

// `updateViaCache: "none"`: el navegador siempre mira si `sw.js` cambió, sin pasar por el caché HTTP.
export async function registerServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;

  try {
    await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE, updateViaCache: "none" });
  } catch {
    // Sin service worker no hay avisos, pero el panel sigue andando igual.
  }
}

async function readyRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;

  // `ready` no se resuelve nunca si el registro falló: no dejar la pantalla colgada.
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000));
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

export async function getSubscription(): Promise<PushSubscription | null> {
  const registration = await readyRegistration();
  if (!registration || !("pushManager" in registration)) return null;

  return registration.pushManager.getSubscription();
}

export type PushSetupFailure = "denied" | "dismissed" | "unsupported" | "no-key";

export class PushSetupError extends Error {
  constructor(public reason: PushSetupFailure) {
    super(reason);
  }
}

// Pide el permiso y suscribe este aparato. Tiene que llamarse desde un toque del usuario: el permiso es lo
// primero que se espera, antes de cualquier otra cosa asíncrona. Devuelve la suscripción lista para guardar.
export async function subscribeDevice(): Promise<PushSubscriptionJSON> {
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new PushSetupError("unsupported");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new PushSetupError(permission === "denied" ? "denied" : "dismissed");
  }

  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) throw new PushSetupError("no-key");

  const registration = await readyRegistration();
  if (!registration) throw new PushSetupError("unsupported");

  const options = { userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(key) };
  const existing = await registration.pushManager.getSubscription();

  try {
    return (existing ?? (await registration.pushManager.subscribe(options))).toJSON();
  } catch {
    // La suscripción vieja se hizo con otra clave VAPID: se descarta y se hace de nuevo.
    await existing?.unsubscribe();
    return (await registration.pushManager.subscribe(options)).toJSON();
  }
}

// Desuscribe este aparato del navegador y devuelve su `endpoint` (para sacarlo de la base).
export async function unsubscribeDevice(): Promise<string | null> {
  const subscription = await getSubscription();
  if (!subscription) return null;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();

  return endpoint;
}
