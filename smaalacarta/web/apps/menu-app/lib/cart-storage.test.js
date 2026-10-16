import { describe, expect, it } from "vitest";

import { loadCart, saveCart } from "./cart-storage.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    has: (key) => values.has(key),
  };
}

describe("carrito aislado por negocio (CARRITO-3)", () => {
  it("guarda y carga cada carrito con una clave propia del slug", () => {
    const storage = memoryStorage();
    const ozCart = [{ nombre: "Hamburguesa", cantidad: 1 }];
    const focacciaCart = [{ nombre: "Focaccia", cantidad: 2 }];

    saveCart(storage, "ozburguer", ozCart);
    saveCart(storage, "focaccias-de-cris", focacciaCart);

    expect(loadCart(storage, "ozburguer")).toEqual(ozCart);
    expect(loadCart(storage, "focaccias-de-cris")).toEqual(focacciaCart);
  });

  it("no importa el carrito anterior que no identificaba a qué negocio pertenecía", () => {
    const storage = memoryStorage({ cart: JSON.stringify([{ nombre: "Hamburguesa", cantidad: 1 }]) });

    expect(loadCart(storage, "focaccias-de-cris")).toEqual([]);
    expect(storage.has("cart")).toBe(true);
  });
});
