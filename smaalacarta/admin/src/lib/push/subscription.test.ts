import { describe, expect, it } from "vitest";

import { parseSubscription } from "./subscription";

const valid = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "BNc...", auth: "xyz" } };

describe("suscripción que manda el navegador — ADMIN-PWA-3", () => {
  it("acepta la forma de `subscription.toJSON()`", () => {
    expect(parseSubscription(valid)).toEqual({
      ok: true,
      value: { endpoint: valid.endpoint, p256dh: "BNc...", auth: "xyz" },
    });
  });

  it.each([
    ["nada", null],
    ["un texto", "https://x"],
    ["sin claves", { endpoint: valid.endpoint }],
    ["endpoint http", { ...valid, endpoint: "http://push.example/x" }],
    ["endpoint vacío", { ...valid, endpoint: "" }],
    ["clave vacía", { ...valid, keys: { p256dh: " ", auth: "xyz" } }],
    ["auth que no es texto", { ...valid, keys: { p256dh: "BNc", auth: 5 } }],
  ])("rechaza %s", (_name, input) => {
    expect(parseSubscription(input)).toEqual({ ok: false });
  });
});
