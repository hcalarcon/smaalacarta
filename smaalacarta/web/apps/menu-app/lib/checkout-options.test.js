import { describe, expect, it } from "vitest";

import { checkoutOptions, deliveryNotice, transferDetails } from "./checkout-options.js";
import { DICTIONARY, LANGS } from "./i18n.js";

const TODAS = {
  delivery: ["delivery", "retiro"],
  payment: ["efectivo", "transferencia", "tarjeta"],
};

describe("checkoutOptions — PUBLICO-19", () => {
  it("ofrece lo que el negocio habilitó, en el orden de siempre", () => {
    const r = checkoutOptions({ entrega: ["retiro", "delivery"], pagos: ["tarjeta", "efectivo"] });

    expect(r.delivery.options).toEqual(["delivery", "retiro"]);
    expect(r.payment.options).toEqual(["efectivo", "tarjeta"]);
  });

  it("con un menú que no trae esos campos ofrece todo, como hasta ahora", () => {
    for (const config of [undefined, null, {}, { entrega: "x", pagos: null }]) {
      const r = checkoutOptions(config);

      expect(r.delivery.options).toEqual(TODAS.delivery);
      expect(r.payment.options).toEqual(TODAS.payment);
    }
  });

  it("ignora valores desconocidos; si no queda ninguno, ofrece todo", () => {
    expect(checkoutOptions({ entrega: ["drone", "retiro"] }).delivery.options).toEqual(["retiro"]);
    expect(checkoutOptions({ entrega: ["drone"] }).delivery.options).toEqual(TODAS.delivery);
    expect(checkoutOptions({ pagos: [] }).payment.options).toEqual(TODAS.payment);
  });

  it("con una sola opción en un grupo, la marca para preseleccionarla", () => {
    const r = checkoutOptions({ entrega: ["retiro"], pagos: ["efectivo", "tarjeta"] });

    expect(r.delivery.single).toBe("retiro");
    expect(r.payment.single).toBeNull();
  });

  it("con todo habilitado no preselecciona nada", () => {
    const r = checkoutOptions({ entrega: TODAS.delivery, pagos: TODAS.payment });

    expect(r.delivery.single).toBeNull();
    expect(r.payment.single).toBeNull();
  });
});

describe("deliveryNotice — PUBLICO-22", () => {
  it("solo retiro: avisa que se retira en el local, con la dirección si la hay", () => {
    expect(deliveryNotice({ entrega: ["retiro"], direccion: "San Martín 100" })).toEqual({
      kind: "pickup",
      address: "San Martín 100",
    });
    expect(deliveryNotice({ entrega: ["retiro"] })).toEqual({ kind: "pickup" });
  });

  it("solo delivery: avisa que el pedido se lleva a domicilio", () => {
    expect(deliveryNotice({ entrega: ["delivery"], direccion: "San Martín 100" })).toEqual({
      kind: "delivery",
    });
  });

  it("con las dos opciones, o sin lista (JSON), no hay aviso: el cliente elige", () => {
    expect(deliveryNotice({ entrega: ["delivery", "retiro"] })).toBeNull();
    expect(deliveryNotice({})).toBeNull();
    expect(deliveryNotice(null)).toBeNull();
  });

  it("ignora una dirección vacía", () => {
    expect(deliveryNotice({ entrega: ["retiro"], direccion: "  " })).toEqual({ kind: "pickup" });
  });
});

describe("transferDetails — PUBLICO-20", () => {
  const config = { transferencia: { alias: "casa.resto", cbu: "0000003100012345678901" } };

  it("con pago por transferencia devuelve el alias y el CBU", () => {
    expect(transferDetails(config, "transferencia")).toEqual({
      alias: "casa.resto",
      cbu: "0000003100012345678901",
    });
  });

  it("con otro medio de pago no devuelve nada", () => {
    expect(transferDetails(config, "efectivo")).toBeNull();
    expect(transferDetails(config, "")).toBeNull();
  });

  it("devuelve solo lo que el negocio cargó", () => {
    expect(transferDetails({ transferencia: { alias: "casa.resto" } }, "transferencia")).toEqual({
      alias: "casa.resto",
    });
  });

  it("sin datos cargados no devuelve nada", () => {
    expect(transferDetails({}, "transferencia")).toBeNull();
    expect(transferDetails({ transferencia: {} }, "transferencia")).toBeNull();
    expect(transferDetails({ transferencia: { alias: 5, cbu: "" } }, "transferencia")).toBeNull();
    expect(transferDetails(null, "transferencia")).toBeNull();
  });
});

describe("textos de entrega y pago — PUBLICO-21", () => {
  it.each(["checkout.alias", "checkout.cbu", "thanks.transfer", "thanks.copy", "thanks.copied", "error.optionsChanged", "checkout.onlyPickup", "checkout.onlyPickupAt", "checkout.onlyDelivery"])(
    "%s está en los tres idiomas",
    (key) => {
      for (const lang of LANGS) {
        expect(DICTIONARY[lang][key], `${key} (${lang})`).toBeTruthy();
      }
    },
  );
});
