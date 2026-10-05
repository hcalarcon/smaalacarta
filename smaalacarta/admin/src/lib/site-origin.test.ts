import { beforeEach, describe, expect, it, vi } from "vitest";

import { BASE_PATH } from "./base-path";

const headerValues = vi.hoisted(() => ({ current: {} as Record<string, string> }));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => headerValues.current[name] ?? null }),
}));

import { recoveryRedirectUrl, siteOrigin } from "./site-origin";

describe("siteOrigin", () => {
  beforeEach(() => {
    headerValues.current = {};
  });

  it("usa el origen del navegador si viene", async () => {
    headerValues.current = { origin: "https://www.smaalacarta.com.ar", host: "smaalacarta-admin.vercel.app" };
    expect(await siteOrigin()).toBe("https://www.smaalacarta.com.ar");
  });

  it("sin origen, arma https con el host", async () => {
    headerValues.current = { host: "smaalacarta-admin.vercel.app" };
    expect(await siteOrigin()).toBe("https://smaalacarta-admin.vercel.app");
  });

  it("en localhost usa http", async () => {
    headerValues.current = { host: "localhost:3000" };
    expect(await siteOrigin()).toBe("http://localhost:3000");
  });
});

describe("recoveryRedirectUrl — ADMIN-AUTH-11", () => {
  it("el basePath sale de un solo lugar y es /admin", () => {
    expect(BASE_PATH).toBe("/admin");
  });

  it("en producción el link vuelve a /admin/auth/callback", () => {
    expect(recoveryRedirectUrl("https://www.smaalacarta.com.ar")).toBe(
      "https://www.smaalacarta.com.ar/admin/auth/callback?next=/restablecer",
    );
  });

  it("en localhost también lleva el basePath", () => {
    expect(recoveryRedirectUrl("http://localhost:3000")).toBe(
      "http://localhost:3000/admin/auth/callback?next=/restablecer",
    );
  });
});
