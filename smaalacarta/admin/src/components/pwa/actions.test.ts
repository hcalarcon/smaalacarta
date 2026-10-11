// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, getHeader } = vi.hoisted(() => ({
  db: { savePushSubscription: vi.fn(), deletePushSubscription: vi.fn(), hasPushSubscription: vi.fn() },
  getHeader: vi.fn(),
}));

vi.mock("@/lib/db/push", () => db);
vi.mock("next/headers", () => ({ headers: async () => ({ get: getHeader }) }));

import { deletePushSubscriptionAction, hasPushSubscriptionAction, savePushSubscriptionAction } from "./actions";

const SUBSCRIPTION = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "BNc", auth: "xyz" } };

beforeEach(() => {
  vi.clearAllMocks();
  db.savePushSubscription.mockResolvedValue({ ok: true });
  db.deletePushSubscription.mockResolvedValue({ ok: true });
  db.hasPushSubscription.mockResolvedValue(true);
  getHeader.mockReturnValue("Mozilla/5.0 (Linux; Android 14)");
});

describe("acciones de suscripción push — ADMIN-PWA-2 a 4", () => {
  it("guarda la suscripción con el navegador de quien la manda", async () => {
    const result = await savePushSubscriptionAction(SUBSCRIPTION);

    expect(result).toEqual({ ok: true });
    expect(db.savePushSubscription).toHaveBeenCalledWith(
      { endpoint: SUBSCRIPTION.endpoint, p256dh: "BNc", auth: "xyz" },
      "Mozilla/5.0 (Linux; Android 14)",
    );
  });

  it("no llega a la base con una suscripción mal formada", async () => {
    for (const bad of [null, {}, { endpoint: "http://push.example/x", keys: { p256dh: "a", auth: "b" } }]) {
      expect(await savePushSubscriptionAction(bad)).toMatchObject({ ok: false });
    }

    expect(db.savePushSubscription).not.toHaveBeenCalled();
  });

  it("si la base falla, devuelve un error sin detalles", async () => {
    db.savePushSubscription.mockResolvedValue({ error: { code: "42501", message: "TOKEN-SECRETO" } });

    const result = await savePushSubscriptionAction(SUBSCRIPTION);

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("TOKEN-SECRETO");
  });

  it("desactivar borra la suscripción de ese aparato", async () => {
    expect(await deletePushSubscriptionAction("https://push.example/1")).toEqual({ ok: true });
    expect(db.deletePushSubscription).toHaveBeenCalledWith("https://push.example/1");

    expect(await deletePushSubscriptionAction("")).toMatchObject({ ok: false });
  });

  it("pregunta si este aparato está en la cuenta actual (ADMIN-PWA-28)", async () => {
    expect(await hasPushSubscriptionAction("https://push.example/1")).toBe(true);
    expect(await hasPushSubscriptionAction("")).toBe(false);
    expect(db.hasPushSubscription).toHaveBeenCalledTimes(1);
  });
});
