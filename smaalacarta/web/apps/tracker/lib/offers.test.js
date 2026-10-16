import { describe, expect, it } from "vitest";

import { confirmText, countdown, countdownText, formatClock, offerView, sortOffers, WARN_BEFORE_MS } from "./offers.js";

const money = { format: (n) => `$${n}` };
const offer = (extra = {}) => ({ id: "o", courier: "Damián", price: 5000, reason: null, favorite: false, ...extra });

describe("sortOffers — SEGUIMIENTO-28", () => {
  it("el favorito primero, después por precio y a igual precio el orden de llegada", () => {
    const list = [
      offer({ id: "a", price: 4000 }),
      offer({ id: "b", price: 6000, favorite: true }),
      offer({ id: "c", price: 3000 }),
      offer({ id: "d", price: 4000 }),
    ];

    expect(sortOffers(list).map((o) => o.id)).toEqual(["b", "c", "a", "d"]);
    // No toca la lista original.
    expect(list.map((o) => o.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("tolera algo que no es una lista", () => {
    expect(sortOffers(null)).toEqual([]);
    expect(sortOffers("x")).toEqual([]);
  });
});

describe("countdown — SEGUIMIENTO-29", () => {
  const now = Date.parse("2026-10-09T22:00:00Z");

  it("dice cuánto falta, en m:ss", () => {
    expect(countdown(now + 200_000, now)).toMatchObject({ clock: "3:20", over: false, warn: false });
    expect(formatClock(61_500)).toBe("1:02");
    expect(formatClock(0)).toBe("0:00");
  });

  it("en el último minuto marca el aviso", () => {
    expect(countdown(now + WARN_BEFORE_MS, now)).toMatchObject({ warn: true, over: false });
    expect(countdown(now + WARN_BEFORE_MS + 1000, now).warn).toBe(false);
  });

  it("vencido no queda negativo", () => {
    expect(countdown(now - 5000, now)).toMatchObject({ clock: "0:00", over: true, warn: false });
  });

  it("sin cierre no hay cuenta", () => {
    expect(countdown(null, now)).toBeNull();
    expect(countdownText(null, "es")).toBe("");
  });

  it("el texto, en cada idioma", () => {
    const timer = countdown(now + 200_000, now);
    expect(countdownText(timer, "es")).toBe("Si no elegís en 3:20, elegimos la más barata");
    expect(countdownText(timer, "en")).toBe("If you don't choose in 3:20, we pick the cheapest");
    expect(countdownText(timer, "pt")).toBe("Se você não escolher em 3:20, escolhemos a mais barata");
    expect(countdownText(countdown(now - 1, now), "es")).toBe("Estamos eligiendo la más barata…");
  });
});

describe("offerView y confirmText — SEGUIMIENTO-28", () => {
  it("nombre, precio, y motivo y precio de lista solo si cambió", () => {
    expect(offerView(offer(), 5000, "es", money)).toEqual({
      id: "o",
      name: "Damián",
      price: "$5000",
      reason: null,
      list: null,
      recommended: false,
      vehicles: [],
    });

    expect(offerView(offer({ price: 6500, reason: "Fuera de zona", favorite: true }), 5000, "es", money)).toEqual({
      id: "o",
      name: "Damián",
      price: "$6500",
      reason: "Fuera de zona",
      list: "$5000",
      recommended: true,
      vehicles: [],
    });

    expect(offerView(offer({ vehicles: ["moto", "auto"] }), 5000, "es", money).vehicles).toEqual(["moto", "auto"]);
  });

  it("sin nombre no inventa uno", () => {
    expect(offerView(offer({ courier: "" }), 5000, "es", money).name).toBe("el repartidor");
  });

  it("la confirmación nombra al repartidor y el precio", () => {
    expect(confirmText(offer({ price: 4500 }), "es", money)).toBe("¿Elegís a Damián por $4500?");
    expect(confirmText(offer({ price: 4500 }), "en", money)).toBe("Choose Damián for $4500?");
  });
});
