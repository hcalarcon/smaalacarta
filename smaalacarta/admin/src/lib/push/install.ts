// Qué controles mostrar según el aparato y su estado (ADMIN-PWA-12 a 15). Puro: el navegador se mide en
// `src/components/pwa/` y acá solo se decide. Si el panel pasa a app nativa, esta parte se reemplaza.

export type NotificationPermissionState = "default" | "granted" | "denied" | "unsupported";

export type DeviceState = {
  // iPhone o iPad (Safari no ofrece instalar: hay que agregarla a mano desde Compartir).
  isIOS: boolean;
  // Abierta desde el ícono instalado (`display-mode: standalone` o `navigator.standalone`).
  standalone: boolean;
  // Se disparó `appinstalled` en esta sesión.
  installed: boolean;
  // El navegador ofreció instalar (`beforeinstallprompt`) y todavía no se usó.
  canPromptInstall: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  permission: NotificationPermissionState;
  // Este aparato tiene una suscripción push activa.
  subscribed: boolean;
};

export type InstallControl = "hidden" | "prompt" | "ios-steps";

export function installControl(device: DeviceState): InstallControl {
  if (device.standalone || device.installed) return "hidden";
  if (device.canPromptInstall) return "prompt";
  if (device.isIOS) return "ios-steps";
  return "hidden";
}

export type PushControl = "hidden" | "enable" | "enabled" | "blocked" | "install-first";

export function pushControl(device: DeviceState): PushControl {
  // En iPhone los avisos solo existen con la app instalada, y Safari ni siquiera trae `PushManager`
  // hasta entonces: se dice qué hacer en vez de esconder el botón.
  if (device.isIOS && !device.standalone) return "install-first";
  if (!device.hasServiceWorker || !device.hasPushManager) return "hidden";
  if (device.permission === "denied") return "blocked";
  if (device.subscribed) return "enabled";
  return "enable";
}

// Con el permiso ya concedido y la suscripción perdida (o de otra cuenta) se vuelve a suscribir solo: no hay
// nada que preguntar (ADMIN-PWA-38). Sin permiso concedido pedirlo tiene que ser de un toque.
export function shouldResubscribe(device: DeviceState): boolean {
  if (device.isIOS && !device.standalone) return false;
  if (!device.hasServiceWorker || !device.hasPushManager) return false;
  return device.permission === "granted" && !device.subscribed;
}

export const COURIER_BANNER_TEXT = "Activá los avisos para enterarte de los pedidos nuevos";

// El recuadro del repartidor se ve mientras haya algo que hacer para recibir avisos.
export function showCourierBanner(control: PushControl): boolean {
  return control === "enable" || control === "install-first" || control === "blocked";
}

export function detectIOS(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  // iPadOS 13+ se presenta como una Mac; lo que lo delata es la pantalla táctil.
  return platform === "MacIntel" && maxTouchPoints > 1;
}
