import { describe, expect, it } from "vitest";

import {
  chosenOptions,
  describeChosen,
  parseManualMenu,
  promoHasChoices,
  promoUnits,
  searchMenu,
  selectionProblems,
  unitPriceWith,
  type ManualOptionGroup,
} from "./manual-menu";

const raw = {
  config: { entrega: ["delivery", "retiro"], pagos: ["efectivo", "transferencia", "mercadopago"] },
  menu: {
    categorias: [
      {
        nombre: "Ofertas",
        tipo: "ofertas",
        items: [{ id: "promo-1", esPromo: true, nombre: "Combo Burger", precio: 8000 }],
      },
      {
        nombre: "Comidas",
        items: [
          {
            id: "p-1",
            nombre: "Hamburguesa",
            precio: 5000,
            opciones: [
              {
                id: "g-punto",
                nombre: "Punto",
                min: 1,
                max: 1,
                repetir: false,
                opciones: [
                  { id: "o-jugoso", nombre: "Jugoso", precio: 0 },
                  { id: "o-cocido", nombre: "Cocido", precio: 0, agotado: true },
                ],
              },
              {
                id: "g-extras",
                nombre: "Extras",
                min: 0,
                max: 3,
                repetir: true,
                opciones: [{ id: "o-queso", nombre: "Queso", precio: 500 }],
              },
            ],
          },
          { id: "p-2", nombre: "Café con leche", precio: 1000, agotado: true },
        ],
      },
    ],
  },
};

const groups = parseManualMenu(raw).items.find((item) => item.id === "p-1")!.groups;

describe("menú del pedido manual — ADMIN-PEDIDOS-40 y 47", () => {
  it("arma productos y promociones con sus grupos de opciones", () => {
    const menu = parseManualMenu(raw);

    expect(menu.items.map((item) => [item.id, item.kind, item.category])).toEqual([
      ["promo-1", "promo", "Ofertas"],
      ["p-1", "product", "Comidas"],
      ["p-2", "product", "Comidas"],
    ]);
    expect(menu.items[2].soldOut).toBe(true);
    expect(groups.map((group) => [group.id, group.min, group.max, group.repeat])).toEqual([
      ["g-punto", 1, 1, false],
      ["g-extras", 0, 3, true],
    ]);
    expect(menu.items[0].groups).toEqual([]);
  });

  it("toma la entrega y el pago del negocio y nunca ofrece Mercado Pago", () => {
    const menu = parseManualMenu(raw);

    expect(menu.delivery).toEqual(["delivery", "retiro"]);
    expect(menu.payments).toEqual(["efectivo", "transferencia"]);
  });

  it("lo que no tiene forma de menú da vacío, sin romper", () => {
    for (const value of [null, undefined, "x", 3, [], {}]) {
      expect(parseManualMenu(value)).toEqual({ items: [], delivery: [], payments: [] });
    }
  });
});

describe("buscador — ADMIN-PEDIDOS-47", () => {
  const { items } = parseManualMenu(raw);

  it("busca sin tildes ni mayúsculas, por nombre o categoría", () => {
    expect(searchMenu(items, "CAFE").map((item) => item.id)).toEqual(["p-2"]);
    expect(searchMenu(items, "comidas").map((item) => item.id)).toEqual(["p-1", "p-2"]);
  });

  it("sin texto devuelve todo", () => {
    expect(searchMenu(items, "  ")).toHaveLength(3);
  });

  it("sin coincidencias devuelve vacío", () => {
    expect(searchMenu(items, "pizza")).toEqual([]);
  });
});

describe("elección de opciones — ADMIN-PEDIDOS-40", () => {
  const problems = (selection: Record<string, number>, g: ManualOptionGroup[] = groups) =>
    selectionProblems(g, selection);

  it("una elección completa es válida", () => {
    expect(problems({ "o-jugoso": 1, "o-queso": 2 })).toEqual({});
  });

  it("falta el grupo obligatorio (min)", () => {
    expect(problems({ "o-queso": 1 })).toEqual({ "g-punto": "min" });
  });

  it("no deja pasar el máximo ni una repetida donde no se puede", () => {
    expect(problems({ "o-jugoso": 2 })).toEqual({ "g-punto": "max" });
    expect(problems({ "o-jugoso": 1, "o-queso": 4 })).toEqual({ "g-extras": "max" });

    const sinRepetir: ManualOptionGroup[] = [{ ...groups[1], repeat: false }];
    expect(problems({ "o-queso": 2 }, sinRepetir)).toEqual({ "g-extras": "repeat" });
  });

  it("una opción agotada no se puede elegir", () => {
    expect(problems({ "o-cocido": 1 })).toEqual({ "g-punto": "soldOut" });
  });

  it("calcula el precio de una unidad con los extras", () => {
    const chosen = chosenOptions(groups, { "o-jugoso": 1, "o-queso": 2 });

    expect(chosen.map((option) => [option.name, option.quantity, option.price])).toEqual([
      ["Jugoso", 1, 0],
      ["Queso", 2, 500],
    ]);
    expect(unitPriceWith(5000, chosen)).toBe(6000);
    expect(describeChosen(chosen)).toBe("Jugoso, Queso ×2");
  });
});

describe("promociones con componentes — ADMIN-PROMOS-8", () => {
  const withComponents = parseManualMenu({
    menu: {
      categorias: [
        {
          nombre: "Ofertas",
          tipo: "ofertas",
          items: [
            {
              id: "promo-1",
              esPromo: true,
              nombre: "3 empanadas + gaseosa",
              precio: 3000,
              componentes: [
                {
                  id: "p-emp",
                  nombre: "Empanada clásica",
                  cantidad: 3,
                  opciones: [
                    {
                      id: "g-gusto",
                      nombre: "Gusto",
                      min: 1,
                      max: 1,
                      repetir: false,
                      opciones: [{ id: "o-carne", nombre: "Carne", precio: 0 }],
                    },
                  ],
                },
                { id: "p-gas", nombre: "Gaseosas", cantidad: 1 },
              ],
            },
            { id: "promo-2", esPromo: true, nombre: "Vieja", precio: 900 },
          ],
        },
      ],
    },
  }).items;

  it("lee los componentes con su cantidad y sus grupos", () => {
    expect(withComponents[0].components.map((c) => [c.name, c.quantity, c.groups.length])).toEqual([
      ["Empanada clásica", 3, 1],
      ["Gaseosas", 1, 0],
    ]);
  });

  it("una promo sin componentes (o un producto) no pide nada", () => {
    expect(withComponents[1].components).toEqual([]);
    expect(promoHasChoices(withComponents[1])).toBe(false);
    expect(promoHasChoices(parseManualMenu(raw).items.find((i) => i.id === "p-1")!)).toBe(false);
  });

  it("pide elegir si algún producto tiene grupos", () => {
    expect(promoHasChoices(withComponents[0])).toBe(true);
  });

  it("arma una unidad por cada unidad de cada producto, con su título", () => {
    expect(promoUnits(withComponents[0].components).map((u) => u.title)).toEqual([
      "Empanada clásica 1 de 3",
      "Empanada clásica 2 de 3",
      "Empanada clásica 3 de 3",
      "Gaseosas",
    ]);
  });
});
