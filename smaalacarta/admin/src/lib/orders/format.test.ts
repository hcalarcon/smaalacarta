import { describe, expect, it } from "vitest";

import { timeAgo, trackingUrl } from "./format";

describe("timeAgo", () => {
  const now = new Date("2026-09-29T15:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it.each([
    [0, "ahora"],
    [30_000, "ahora"],
    [59_000, "ahora"],
    [60_000, "hace 1 min"],
    [5 * 60_000, "hace 5 min"],
    [59 * 60_000, "hace 59 min"],
    [60 * 60_000, "hace 1 h"],
    [5 * 3_600_000, "hace 5 h"],
    [23 * 3_600_000, "hace 23 h"],
    [24 * 3_600_000, "hace 1 día"],
    [3 * 24 * 3_600_000, "hace 3 días"],
  ])("hace %i ms → %s", (ms, esperado) => {
    expect(timeAgo(ago(ms), now)).toBe(esperado);
  });

  it("una fecha futura (reloj desfasado) se muestra como ahora", () => {
    expect(timeAgo(new Date(now.getTime() + 5 * 60_000).toISOString(), now)).toBe("ahora");
  });

  it("una fecha inválida no rompe", () => {
    expect(timeAgo("no es una fecha", now)).toBe("");
  });
});

describe("trackingUrl — SEGUIMIENTO-5", () => {
  it("arma el link con el subdominio del negocio y el código", () => {
    expect(trackingUrl("ana", "0123456789abcdef0123")).toBe(
      "https://ana.smaalacarta.com.ar/pedido/0123456789abcdef0123",
    );
  });

  it("acepta otro dominio base", () => {
    expect(trackingUrl("ana", "0123456789abcdef0123", "smaalacarta.online")).toBe(
      "https://ana.smaalacarta.online/pedido/0123456789abcdef0123",
    );
  });
});
