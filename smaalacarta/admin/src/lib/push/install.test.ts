import { describe, expect, it } from "vitest";

import {
  COURIER_BANNER_TEXT,
  detectIOS,
  installControl,
  pushControl,
  showCourierBanner,
  type DeviceState,
} from "./install";

const DEVICE: DeviceState = {
  isIOS: false,
  standalone: false,
  installed: false,
  canPromptInstall: false,
  hasServiceWorker: true,
  hasPushManager: true,
  permission: "default",
  subscribed: false,
};

const device = (extra: Partial<DeviceState> = {}): DeviceState => ({ ...DEVICE, ...extra });

describe("Instalar app — ADMIN-PWA-12", () => {
  it("en Chrome, Edge y Android se ve cuando el navegador ofreció instalar", () => {
    expect(installControl(device({ canPromptInstall: true }))).toBe("prompt");
  });

  it("en iPhone y iPad sin instalar muestra los pasos de Compartir → Agregar a inicio", () => {
    expect(installControl(device({ isIOS: true }))).toBe("ios-steps");
  });

  it("no se ve si ya está instalada, en ninguna de sus formas", () => {
    expect(installControl(device({ standalone: true, canPromptInstall: true }))).toBe("hidden");
    expect(installControl(device({ installed: true, canPromptInstall: true }))).toBe("hidden");
    expect(installControl(device({ isIOS: true, standalone: true }))).toBe("hidden");
  });

  it("no se ve en navegadores que no permiten instalar", () => {
    expect(installControl(device())).toBe("hidden");
  });
});

describe("Activar avisos — ADMIN-PWA-13 y 14", () => {
  it("se ve con service worker y PushManager si el aparato no está suscripto", () => {
    expect(pushControl(device())).toBe("enable");
  });

  it("suscripto dice que los avisos están activados", () => {
    expect(pushControl(device({ subscribed: true, permission: "granted" }))).toBe("enabled");
  });

  it("con el permiso bloqueado lo dice, aunque no haya suscripción", () => {
    expect(pushControl(device({ permission: "denied" }))).toBe("blocked");
  });

  it("en iPhone sin instalar pide instalar primero, aunque Safari no tenga PushManager", () => {
    expect(pushControl(device({ isIOS: true, hasPushManager: false }))).toBe("install-first");
    // Ya instalada, el PushManager existe y se puede activar.
    expect(pushControl(device({ isIOS: true, standalone: true }))).toBe("enable");
  });

  it("sin service worker o sin PushManager (fuera de iPhone) no se muestra", () => {
    expect(pushControl(device({ hasServiceWorker: false }))).toBe("hidden");
    expect(pushControl(device({ hasPushManager: false }))).toBe("hidden");
  });
});

describe("recuadro del repartidor — ADMIN-PWA-15", () => {
  it("se ve mientras no tenga avisos activados y se pueda hacer algo", () => {
    expect(showCourierBanner("enable")).toBe(true);
    expect(showCourierBanner("install-first")).toBe(true);
    expect(showCourierBanner("blocked")).toBe(true);
  });

  it("no se ve con avisos activados ni donde no se pueden activar", () => {
    expect(showCourierBanner("enabled")).toBe(false);
    expect(showCourierBanner("hidden")).toBe(false);
  });

  it("dice qué hacer", () => {
    expect(COURIER_BANNER_TEXT).toBe("Activá los avisos para enterarte de los pedidos nuevos");
  });
});

describe("detectIOS", () => {
  it("reconoce iPhone, iPad y el iPad que se presenta como Mac", () => {
    expect(detectIOS("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", "iPhone", 5)).toBe(true);
    expect(detectIOS("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)", "iPad", 5)).toBe(true);
    expect(detectIOS("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 5)).toBe(true);
  });

  it("una Mac común y Android no son iOS", () => {
    expect(detectIOS("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 0)).toBe(false);
    expect(detectIOS("Mozilla/5.0 (Linux; Android 14; Pixel 8)", "Linux armv8l", 5)).toBe(false);
  });
});
