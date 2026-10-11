// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { config } from "../../../proxy";

// ADMIN-PWA-11: el proxy redirige a /login a quien no tiene sesión; el service worker, el manifest, los
// íconos y el webhook de los avisos los piden sin sesión y no pueden pasar por ahí.
const matcher = new RegExp(`^${config.matcher[0]}$`);
const runsProxy = (path: string) => matcher.test(path);

describe("matcher del proxy — ADMIN-PWA-11", () => {
  it.each(["/sw.js", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-maskable-512.png", "/api/push/order"])(
    "no pasa por el proxy: %s",
    (path) => {
      expect(runsProxy(path)).toBe(false);
    },
  );

  it.each(["/", "/dashboard", "/dashboard/orders", "/repartidor", "/superadmin", "/api/other"])(
    "sí pasa por el proxy: %s",
    (path) => {
      expect(runsProxy(path)).toBe(true);
    },
  );

  it("sigue sin pasar lo que no pasaba (Mercado Pago, estáticos)", () => {
    expect(runsProxy("/api/mp/webhook")).toBe(false);
    expect(runsProxy("/_next/static/chunks/app.js")).toBe(false);
    expect(runsProxy("/favicon.ico")).toBe(false);
  });
});
