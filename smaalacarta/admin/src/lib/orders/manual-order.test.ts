import { describe, expect, it } from "vitest";

import {
  addLine,
  orderTotal,
  setLineQuantity,
  toRpcItems,
  validateManualOrder,
  type ManualFreeLine,
  type ManualMenuLine,
  type ManualOrderInput,
} from "./manual-order";

const ZONA = "e1e1e1e1-0000-0000-0000-000000000001";

const cafe: ManualMenuLine = { kind: "product", id: "p-1", name: "Café", unitPrice: 1000, quantity: 1 };
const libre: ManualFreeLine = { kind: "free", name: "Torta", unitPrice: 2500.5, quantity: 2 };

const valid: ManualOrderInput = {
  customerName: "Ana Pérez",
  delivery: "retiro",
  payment: "efectivo",
  notes: "Sin sal",
  items: [cafe, libre],
};

const envio: ManualOrderInput = {
  ...valid,
  delivery: "delivery",
  phone: "351 555-1234",
  zoneId: ZONA,
  address: "Av. Siempre Viva 742",
  courierMode: "offers",
};

const errorsOf = (input: ManualOrderInput, courier = false) => {
  const r = validateManualOrder(input, { courier });
  return r.ok ? {} : r.errors;
};

describe("validateManualOrder — ADMIN-PEDIDOS-3", () => {
  it("acepta un pedido válido", () => {
    expect(validateManualOrder(valid)).toEqual({ ok: true });
  });

  it("las notas, el teléfono y la hora son opcionales en retiro", () => {
    expect(validateManualOrder({ ...valid, notes: "", phone: "", scheduledFor: "" })).toEqual({ ok: true });
  });

  it.each(["", "   ", "a".repeat(81)])("rechaza el nombre %j", (customerName) => {
    expect(errorsOf({ ...valid, customerName }).customerName).toBeTruthy();
  });

  it("acepta un nombre de 80 caracteres", () => {
    expect(validateManualOrder({ ...valid, customerName: "a".repeat(80) })).toEqual({ ok: true });
  });

  it("respeta el máximo de las notas del pedido", () => {
    expect(errorsOf({ ...valid, notes: "a".repeat(501) }).notes).toBeTruthy();
  });

  it("exige al menos un producto", () => {
    expect(errorsOf({ ...valid, items: [] }).items).toBeTruthy();
  });

  it("acepta hasta 40 productos y rechaza 41", () => {
    const item: ManualFreeLine = { kind: "free", name: "x", unitPrice: 1, quantity: 1 };
    expect(validateManualOrder({ ...valid, items: Array(40).fill(item) })).toEqual({ ok: true });
    expect(errorsOf({ ...valid, items: Array(41).fill(item) }).items).toBeTruthy();
  });

  it.each([
    ["libre sin nombre", { kind: "free", name: "  ", unitPrice: 1, quantity: 1 }],
    ["libre con un nombre de más de 100 caracteres", { kind: "free", name: "a".repeat(101), unitPrice: 1, quantity: 1 }],
    ["libre con precio negativo", { kind: "free", name: "a", unitPrice: -1, quantity: 1 }],
    ["libre con un precio absurdo", { kind: "free", name: "a", unitPrice: 100_000_000, quantity: 1 }],
    ["libre con un precio que no es número", { kind: "free", name: "a", unitPrice: Number.NaN, quantity: 1 }],
    ["con cantidad 0", { ...cafe, quantity: 0 }],
    ["con cantidad decimal", { ...cafe, quantity: 1.5 }],
    ["con cantidad de más de 99", { ...cafe, quantity: 100 }],
    ["del menú sin id", { ...cafe, id: " " }],
    ["con una nota de más de 140 caracteres", { ...cafe, note: "a".repeat(141) }],
  ] as [string, ManualMenuLine | ManualFreeLine][])("rechaza un producto %s", (_caso, item) => {
    expect(errorsOf({ ...valid, items: [item] }).items).toBeTruthy();
  });

  it("acepta un precio libre de cero y un producto de 100 caracteres", () => {
    const item: ManualFreeLine = { kind: "free", name: "a".repeat(100), unitPrice: 0, quantity: 99 };
    expect(validateManualOrder({ ...valid, items: [item] })).toEqual({ ok: true });
  });
});

describe("entrega y pago fijos — ADMIN-PEDIDOS-43 y 44", () => {
  it.each(["retiro", "delivery", "local"])("acepta la entrega %s", (delivery) => {
    expect(errorsOf({ ...envio, delivery }, false).delivery).toBeUndefined();
  });

  it.each(["", "mostrador", "Retiro"])("rechaza la entrega %j", (delivery) => {
    expect(errorsOf({ ...valid, delivery }).delivery).toBeTruthy();
  });

  it.each(["efectivo", "transferencia", "tarjeta", "qr"])("acepta el pago %s", (payment) => {
    expect(validateManualOrder({ ...valid, payment })).toEqual({ ok: true });
  });

  it.each(["", "mercadopago", "cripto"])("rechaza el pago %j", (payment) => {
    expect(errorsOf({ ...valid, payment }).payment).toBeTruthy();
  });
});

describe("teléfono — ADMIN-PEDIDOS-45", () => {
  it("es obligatorio con envío", () => {
    expect(errorsOf({ ...envio, phone: "" }).phone).toBeTruthy();
    expect(errorsOf({ ...envio, phone: undefined }, true).phone).toBeTruthy();
    expect(errorsOf({ ...envio, phone: "123" }).phone).toBeTruthy();
  });

  it("con envío acepta de 8 a 15 dígitos con separadores", () => {
    expect(errorsOf({ ...envio, phone: "351 555-1234" }, true).phone).toBeUndefined();
    expect(errorsOf({ ...envio, phone: "+54 9 351 555 1234" }, true).phone).toBeUndefined();
    expect(errorsOf({ ...envio, phone: "1".repeat(16) }, true).phone).toBeTruthy();
  });

  it("es opcional en retiro y consumo en el local, pero si se carga tiene que ser válido", () => {
    for (const delivery of ["retiro", "local"]) {
      expect(errorsOf({ ...valid, delivery, phone: "" }).phone).toBeUndefined();
      expect(errorsOf({ ...valid, delivery, phone: "3515551234" }).phone).toBeUndefined();
      expect(errorsOf({ ...valid, delivery, phone: "12" }).phone).toBeTruthy();
    }
  });
});

describe("envío con repartidor — ENVIO-137", () => {
  it("con repartidor pide barrio, dirección y modo", () => {
    expect(validateManualOrder(envio, { courier: true })).toEqual({ ok: true });

    const errors = errorsOf({ ...envio, zoneId: "", address: "", courierMode: "" }, true);
    expect(Object.keys(errors).sort()).toEqual(["address", "courierMode", "zoneId"]);
  });

  it("acepta los tres modos y rechaza otro", () => {
    for (const courierMode of ["favorite", "offers", "self"]) {
      expect(errorsOf({ ...envio, courierMode }, true).courierMode).toBeUndefined();
    }
    expect(errorsOf({ ...envio, courierMode: "rapido" }, true).courierMode).toBeTruthy();
  });

  it("acepta el modo del repartidor propio — ENVIO-250", () => {
    expect(errorsOf({ ...envio, courierMode: "own" }, true).courierMode).toBeUndefined();
  });

  it("sin zona con precio alcanza con escribir el barrio; sin ninguno de los dos se pide — ENVIO-252", () => {
    expect(errorsOf({ ...envio, zoneId: "", zoneText: "Villa Rural" }, true).zoneId).toBeUndefined();
    expect(errorsOf({ ...envio, zoneId: "", zoneText: "   " }, true).zoneId).toBeTruthy();
    expect(errorsOf({ ...envio, zoneId: "", zoneText: "x".repeat(81) }, true).zoneId).toBeTruthy();
    expect(errorsOf({ ...envio, zoneId: "", zoneText: "x".repeat(80) }, true).zoneId).toBeUndefined();
  });

  it("la dirección va de 5 a 200 caracteres", () => {
    expect(errorsOf({ ...envio, address: "Mitr" }, true).address).toBeTruthy();
    expect(errorsOf({ ...envio, address: "a".repeat(201) }, true).address).toBeTruthy();
    expect(errorsOf({ ...envio, address: "a".repeat(200) }, true).address).toBeUndefined();
  });

  it("sin repartidores en el negocio el envío no pide barrio, dirección ni modo", () => {
    expect(validateManualOrder({ ...envio, zoneId: "", address: "", courierMode: "" }, { courier: false })).toEqual({
      ok: true,
    });
  });

  it("retiro y consumo en el local no piden barrio ni dirección aunque haya repartidores", () => {
    for (const delivery of ["retiro", "local"]) {
      expect(
        validateManualOrder({ ...valid, delivery, zoneId: "", address: "", courierMode: "" }, { courier: true }),
      ).toEqual({ ok: true });
    }
  });
});

describe("toRpcItems — ADMIN-PEDIDOS-40", () => {
  it("manda del menú solo id, tipo, opciones y cantidad: nunca precios", () => {
    const hamb: ManualMenuLine = {
      kind: "product",
      id: "p-2",
      name: "Hamburguesa",
      unitPrice: 5500,
      quantity: 2,
      note: "  sin cebolla ",
      options: [{ id: "o-1", name: "Queso", quantity: 1, price: 500 }],
    };

    expect(toRpcItems([hamb])).toEqual([
      { id: "p-2", kind: "product", quantity: 2, options: [{ id: "o-1", quantity: 1 }], note: "sin cebolla" },
    ]);
  });

  it("un ítem sin nota ni opciones no manda nota y manda una lista de opciones vacía", () => {
    expect(toRpcItems([cafe])).toEqual([{ id: "p-1", kind: "product", quantity: 1, options: [] }]);
  });

  it("un libre manda nombre, precio y cantidad", () => {
    expect(toRpcItems([{ ...libre, name: " Torta ", note: "con vela" }])).toEqual([
      { name: "Torta", unit_price: 2500.5, quantity: 2, note: "con vela" },
    ]);
  });
});

describe("orderTotal", () => {
  it("suma precio por cantidad de cada producto", () => {
    expect(orderTotal(valid.items)).toBe(6001);
  });

  it("evita los errores de coma flotante", () => {
    expect(orderTotal([{ kind: "free", name: "a", unitPrice: 0.1, quantity: 3 }])).toBe(0.3);
    expect(
      orderTotal([
        { kind: "free", name: "a", unitPrice: 0.1, quantity: 1 },
        { kind: "free", name: "b", unitPrice: 0.2, quantity: 1 },
      ]),
    ).toBe(0.3);
  });

  it("un pedido sin productos suma 0", () => {
    expect(orderTotal([])).toBe(0);
  });

  it("ignora los productos con datos que no son números", () => {
    expect(
      orderTotal([
        { kind: "free", name: "a", unitPrice: Number.NaN, quantity: 2 },
        { kind: "free", name: "b", unitPrice: 10, quantity: 1 },
      ]),
    ).toBe(10);
  });
});

describe("addLine y setLineQuantity — ADMIN-PEDIDOS-40", () => {
  const hamb: ManualMenuLine = {
    kind: "product",
    id: "p-2",
    name: "Hamburguesa",
    unitPrice: 5500,
    quantity: 1,
    options: [
      { id: "o-1", name: "Queso", quantity: 1, price: 500 },
      { id: "o-2", name: "Huevo", quantity: 1, price: 300 },
    ],
  };

  it("el mismo producto con las mismas opciones, sin importar el orden, suma la cantidad", () => {
    const again = { ...hamb, options: [...(hamb.options ?? [])].reverse() };

    const items = addLine([hamb], again);

    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(2);
  });

  it("otra elección o otra nota es otra línea", () => {
    const sinHuevo = { ...hamb, options: [hamb.options![0]] };
    const conNota = { ...hamb, note: "sin sal" };

    expect(addLine([hamb], sinHuevo)).toHaveLength(2);
    expect(addLine([hamb], conNota)).toHaveLength(2);
  });

  it("nunca pasa del máximo por línea", () => {
    const items = addLine([{ ...cafe, quantity: 98 }], { ...cafe, quantity: 5 });
    expect(items[0].quantity).toBe(99);
  });

  it("los libres no se juntan", () => {
    expect(addLine([libre], libre)).toHaveLength(2);
  });

  it("la cantidad queda entre 1 y 99", () => {
    expect(setLineQuantity([cafe], 0, 0)[0].quantity).toBe(1);
    expect(setLineQuantity([cafe], 0, 500)[0].quantity).toBe(99);
    expect(setLineQuantity([cafe], 0, 7)[0].quantity).toBe(7);
  });
});
