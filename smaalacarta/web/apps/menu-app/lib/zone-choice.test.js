import { describe, expect, it } from "vitest";

import {
  askZone,
  clearChoice,
  deliveryBlocked,
  filterZones,
  nextFocusIndex,
  readChoice,
  saveChoice,
  validateChoice,
  zoneLabel,
  zoneLabelKey,
} from "./zone-choice.js";
import { formatPrice } from "./price.js";

const ZONES = {
  courier: null,
  whatsapp: null,
  zones: [
    { id: "a", name: "Centro", price: 4500 },
    { id: "b", name: "Cañada Honda", price: 5000 },
    { id: "c", name: "Ángel Vicente", price: 6000 },
  ],
};

function memory() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

const broken = {
  getItem() {
    throw new Error("sin almacenamiento");
  },
  setItem() {
    throw new Error("sin almacenamiento");
  },
  removeItem() {
    throw new Error("sin almacenamiento");
  },
};

describe("askZone — PUBLICO-73", () => {
  it("pregunta solo con entrega delivery habilitada y barrios", () => {
    expect(askZone({ zones: ZONES, deliveryOptions: ["delivery", "retiro"] })).toBe(true);
    expect(askZone({ zones: ZONES, deliveryOptions: ["retiro"] })).toBe(false);
    expect(askZone({ zones: null, deliveryOptions: ["delivery", "retiro"] })).toBe(false);
    expect(askZone({ zones: { zones: [] }, deliveryOptions: ["delivery"] })).toBe(false);
  });
});

describe("filterZones — PUBLICO-74", () => {
  it("ignora acentos y mayúsculas", () => {
    expect(filterZones(ZONES.zones, "canada").map((z) => z.id)).toEqual(["b"]);
    expect(filterZones(ZONES.zones, "ANGEL").map((z) => z.id)).toEqual(["c"]);
  });

  it("sin texto devuelve todas", () => {
    expect(filterZones(ZONES.zones, "  ")).toHaveLength(3);
  });
});

describe("zoneLabel — PUBLICO-75", () => {
  it("arma las variables del texto con el precio formateado", () => {
    expect(zoneLabel(ZONES.zones[0], formatPrice)).toEqual({ zona: "Centro", precio: formatPrice(4500) });
  });
});

describe("zoneLabelKey — ENVIO-228", () => {
  it("'Envío $X' con precio fijo; 'Envío aprox. $X' si puede cambiar o no se sabe", () => {
    expect(zoneLabelKey({ ...ZONES.zones[0], fixed: true })).toBe("zone.availableFixed");
    expect(zoneLabelKey({ ...ZONES.zones[0], fixed: false })).toBe("zone.available");
    expect(zoneLabelKey(ZONES.zones[0])).toBe("zone.available");
  });
});

describe("elección guardada — PUBLICO-77", () => {
  it("guarda y lee una zona o el retiro, por negocio", () => {
    const s = memory();
    saveChoice(s, "pizzeria", { type: "zone", zoneId: "a" });
    saveChoice(s, "otro", { type: "pickup" });
    expect(readChoice(s, "pizzeria")).toEqual({ type: "zone", zoneId: "a" });
    expect(readChoice(s, "otro")).toEqual({ type: "pickup" });
    expect(readChoice(s, "nadie")).toBeNull();
  });

  it("ignora basura guardada", () => {
    const s = memory();
    s.setItem("sma-zona:x", "{no es json");
    expect(readChoice(s, "x")).toBeNull();
    s.setItem("sma-zona:x", JSON.stringify({ type: "otra" }));
    expect(readChoice(s, "x")).toBeNull();
  });

  it("no rompe si el almacenamiento falla", () => {
    expect(readChoice(broken, "x")).toBeNull();
    expect(() => saveChoice(broken, "x", { type: "pickup" })).not.toThrow();
    expect(() => clearChoice(broken, "x")).not.toThrow();
  });

  it("borra la elección", () => {
    const s = memory();
    saveChoice(s, "x", { type: "pickup" });
    clearChoice(s, "x");
    expect(readChoice(s, "x")).toBeNull();
  });

  it("una zona que ya no está en la lista no vale", () => {
    expect(validateChoice({ type: "zone", zoneId: "a" }, ZONES)).toEqual({ type: "zone", zoneId: "a" });
    expect(validateChoice({ type: "zone", zoneId: "z" }, ZONES)).toBeNull();
    expect(validateChoice({ type: "pickup" }, ZONES)).toEqual({ type: "pickup" });
    expect(validateChoice(null, ZONES)).toBeNull();
  });

  it("el retiro no vale si el local ya no lo ofrece", () => {
    expect(validateChoice({ type: "pickup" }, ZONES, { pickup: false })).toBeNull();
  });
});


describe("'Mi barrio no está' bloquea el envío — PUBLICO-80", () => {
  it("solo esa elección bloquea; una zona, el retiro o no haber elegido no", () => {
    expect(deliveryBlocked({ type: "notListed" })).toBe(true);
    expect(deliveryBlocked({ type: "zone", zoneId: "a" })).toBe(false);
    expect(deliveryBlocked({ type: "pickup" })).toBe(false);
    expect(deliveryBlocked(null)).toBe(false);
  });

  it("no se guarda: al volver se pregunta de nuevo", () => {
    const s = memory();
    saveChoice(s, "x", { type: "notListed" });
    expect(readChoice(s, "x")).toBeNull();
    expect(validateChoice({ type: "notListed" }, ZONES)).toBeNull();
  });
});

describe("foco atrapado en el diálogo — PUBLICO-81", () => {
  it("Tab avanza y vuelve al primero; Shift+Tab retrocede y pasa al último", () => {
    expect(nextFocusIndex(0, 3, false)).toBe(1);
    expect(nextFocusIndex(2, 3, false)).toBe(0);
    expect(nextFocusIndex(0, 3, true)).toBe(2);
    expect(nextFocusIndex(2, 3, true)).toBe(1);
  });

  it("con el foco fuera del diálogo entra por el primero (Tab) o el último (Shift+Tab)", () => {
    expect(nextFocusIndex(-1, 3, false)).toBe(0);
    expect(nextFocusIndex(-1, 3, true)).toBe(2);
    expect(nextFocusIndex(-1, 0, false)).toBe(-1);
  });
});
