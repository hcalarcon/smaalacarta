import { describe, expect, it } from "vitest";

import {
  normalizeAlias,
  normalizeCbu,
  normalizeDeliveryPayment,
  PAYMENT_OPTIONS,
  validateDeliveryPayment,
} from "./payment";
import { DEFAULT_SETTINGS, normalizeSettingsText, validateSettings } from "./validation";

const base = {
  deliveryOptions: ["delivery", "retiro"],
  paymentOptions: ["efectivo", "transferencia", "tarjeta"],
  transferAlias: "casa.resto",
  transferCbu: "0000003100012345678901",
};

describe("normalizeAlias y normalizeCbu — ADMIN-CONFIG-12 y 13", () => {
  it("el alias se recorta y el CBU pierde espacios y guiones", () => {
    expect(normalizeAlias("  casa.resto  ")).toBe("casa.resto");
    expect(normalizeCbu("0000003 1000123-4567 8901")).toBe("0000003100012345678901");
  });
});

describe("validateDeliveryPayment — ADMIN-CONFIG-11 a 13", () => {
  it("lo habitual es válido", () => {
    expect(validateDeliveryPayment(base)).toEqual({ ok: true });
  });

  it("alias y CBU son opcionales", () => {
    expect(validateDeliveryPayment({ ...base, transferAlias: "", transferCbu: "" })).toEqual({
      ok: true,
    });
  });

  it("pide al menos un tipo de entrega", () => {
    const r = validateDeliveryPayment({ ...base, deliveryOptions: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.deliveryOptions).toBe("Elegí al menos un tipo de entrega.");
  });

  it("pide al menos un medio de pago", () => {
    const r = validateDeliveryPayment({ ...base, paymentOptions: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.paymentOptions).toBe("Elegí al menos un medio de pago.");
  });

  it("rechaza valores fuera de los conjuntos permitidos", () => {
    const r = validateDeliveryPayment({
      ...base,
      deliveryOptions: ["drone"],
      paymentOptions: ["cripto"],
    });
    expect(r.ok).toBe(false);
  });

  it.each(["abc", "a".repeat(21), "con espacio", "ñandú.pago", "alias$"])(
    "rechaza el alias %j",
    (alias) => {
      const r = validateDeliveryPayment({ ...base, transferAlias: alias });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.transferAlias).toBeTruthy();
    },
  );

  it.each(["casa.resto", "casa-resto-1", "ABC123"])("acepta el alias %j", (alias) => {
    expect(validateDeliveryPayment({ ...base, transferAlias: alias })).toEqual({ ok: true });
  });

  it.each(["123", "00000031000123456789012", "00000031000123456789ab"])(
    "rechaza el CBU %j (tiene que tener 22 dígitos)",
    (cbu) => {
      const r = validateDeliveryPayment({ ...base, transferCbu: cbu });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.transferCbu).toBeTruthy();
    },
  );

  it("sin transferencia no valida alias ni CBU: se van a descartar", () => {
    expect(
      validateDeliveryPayment({
        ...base,
        paymentOptions: ["efectivo"],
        transferAlias: "x",
        transferCbu: "1",
      }),
    ).toEqual({ ok: true });
  });
});

describe("normalizeDeliveryPayment — ADMIN-CONFIG-12", () => {
  it("normaliza alias y CBU", () => {
    expect(
      normalizeDeliveryPayment({
        ...base,
        transferAlias: " casa.resto ",
        transferCbu: "0000003 1000123-4567 8901",
      }),
    ).toEqual(base);
  });

  it("descarta alias y CBU si transferencia no está tildada", () => {
    // Si no, quedarían guardados datos que el negocio ya no ofrece.
    expect(normalizeDeliveryPayment({ ...base, paymentOptions: ["efectivo"] })).toEqual({
      ...base,
      paymentOptions: ["efectivo"],
      transferAlias: "",
      transferCbu: "",
    });
  });
});

describe("Mercado Pago como medio de pago — ADMIN-CONFIG-21", () => {
  it("es una opción más, pero no está en la configuración por defecto", () => {
    expect(PAYMENT_OPTIONS.map((o) => o.key)).toContain("mercadopago");
    expect(PAYMENT_OPTIONS.find((o) => o.key === "mercadopago")?.label).toBe("Mercado Pago");
    expect(DEFAULT_SETTINGS.paymentOptions).not.toContain("mercadopago");
  });

  it("se puede elegir solo o junto a otros, y no pide alias ni CBU", () => {
    expect(validateDeliveryPayment({ ...base, paymentOptions: ["mercadopago"] })).toEqual({ ok: true });
    expect(
      validateDeliveryPayment({ ...base, paymentOptions: ["efectivo", "mercadopago"], transferAlias: "", transferCbu: "" }),
    ).toEqual({ ok: true });
  });
});

describe("validateSettings con entrega y pago — ADMIN-CONFIG-11", () => {
  it("la configuración por defecto lo ofrece todo", () => {
    expect(DEFAULT_SETTINGS.deliveryOptions).toEqual(["delivery", "retiro"]);
    expect(DEFAULT_SETTINGS.paymentOptions).toEqual(["efectivo", "transferencia", "tarjeta"]);
    expect(validateSettings(DEFAULT_SETTINGS)).toEqual({ ok: true });
  });

  it("marca el grupo sin opciones", () => {
    const r = validateSettings({ ...DEFAULT_SETTINGS, paymentOptions: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.paymentOptions).toBe("Elegí al menos un medio de pago.");
  });
});

describe("normalizeSettingsText con entrega y pago — ADMIN-CONFIG-12", () => {
  it("descarta el alias y el CBU de la configuración sin transferencia", () => {
    const r = normalizeSettingsText({
      ...DEFAULT_SETTINGS,
      paymentOptions: ["tarjeta"],
      transferAlias: "casa.resto",
      transferCbu: "0000003100012345678901",
    });

    expect(r.transferAlias).toBe("");
    expect(r.transferCbu).toBe("");
  });
});
