// El menú que ve el local al cargar un pedido manual (ADMIN-PEDIDOS-40 y 47): los productos y promociones
// activos con sus grupos de opciones, tal como los entrega `menu_preview` (el mismo formato del menú público).
// Lógica pura: la elección de opciones sigue las reglas de `web/apps/menu-app/lib/options.js`, y el precio
// final lo vuelve a calcular la base.

export type ManualOption = { id: string; name: string; price: number; soldOut: boolean };

export type ManualOptionGroup = {
  id: string;
  name: string;
  min: number;
  max: number;
  repeat: boolean;
  options: ManualOption[];
};

export type ManualMenuItem = {
  id: string;
  kind: "product" | "promo";
  name: string;
  price: number;
  category: string;
  soldOut: boolean;
  groups: ManualOptionGroup[];
};

export type ManualMenu = {
  items: ManualMenuItem[];
  // Lo que el negocio tiene habilitado en su configuración (sin consumo en el local ni QR).
  delivery: string[];
  payments: string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown) => (typeof value === "string" ? value : "");
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function parseGroups(raw: unknown): ManualOptionGroup[] {
  return list(raw)
    .filter(isRecord)
    .map((group) => ({
      id: text(group.id),
      name: text(group.nombre),
      min: Math.max(0, Math.floor(num(group.min))),
      max: Math.max(0, Math.floor(num(group.max))),
      repeat: group.repetir === true,
      options: list(group.opciones)
        .filter(isRecord)
        .map((option) => ({
          id: text(option.id),
          name: text(option.nombre),
          price: num(option.precio),
          soldOut: option.agotado === true,
        }))
        .filter((option) => option.id !== ""),
    }))
    .filter((group) => group.id !== "" && group.options.length > 0);
}

// Del JSON de `menu_preview` al menú del pedido manual. Nunca lanza: lo que no tiene forma de menú da vacío.
// Mercado Pago no se ofrece (el pedido manual no pasa por el cobro en línea).
export function parseManualMenu(raw: unknown): ManualMenu {
  const empty: ManualMenu = { items: [], delivery: [], payments: [] };
  if (!isRecord(raw)) return empty;

  const config = isRecord(raw.config) ? raw.config : {};
  const menu = isRecord(raw.menu) ? raw.menu : {};

  const items: ManualMenuItem[] = [];
  for (const category of list(menu.categorias).filter(isRecord)) {
    const categoryName = text(category.nombre);
    const isOffers = category.tipo === "ofertas";

    for (const item of list(category.items).filter(isRecord)) {
      const id = text(item.id);
      if (!id) continue;

      const promo = isOffers || item.esPromo === true;

      items.push({
        id,
        kind: promo ? "promo" : "product",
        name: text(item.nombre),
        price: num(item.precio),
        category: categoryName,
        soldOut: item.agotado === true,
        groups: promo ? [] : parseGroups(item.opciones),
      });
    }
  }

  const strings = (value: unknown) => list(value).filter((v): v is string => typeof v === "string");

  return {
    items,
    delivery: strings(config.entrega).filter((v) => v === "retiro" || v === "delivery"),
    payments: strings(config.pagos).filter((v) => v !== "mercadopago"),
  };
}

const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

// El buscador del paso de productos: sin tildes ni mayúsculas, por nombre o categoría. Vacío devuelve todo.
export function searchMenu(items: ManualMenuItem[], query: string): ManualMenuItem[] {
  const needle = fold(query);
  if (!needle) return items;

  return items.filter((item) => fold(item.name).includes(needle) || fold(item.category).includes(needle));
}

// La elección en una hoja de producto: `{ [idOpción]: cantidad }`.
export type Selection = Record<string, number>;

export type SelectionProblem = "min" | "max" | "repeat" | "soldOut";

const quantityOf = (selection: Selection, id: string) => Math.max(0, Math.floor(Number(selection[id]) || 0));

export function groupCount(group: ManualOptionGroup, selection: Selection): number {
  return group.options.reduce((sum, option) => sum + quantityOf(selection, option.id), 0);
}

// Qué falla en cada grupo (por id): faltan (`min`), sobran (`max`), una repetida donde no se puede (`repeat`) o
// una agotada (`soldOut`). Vacío si la elección es válida.
export function selectionProblems(groups: ManualOptionGroup[], selection: Selection): Record<string, SelectionProblem> {
  const problems: Record<string, SelectionProblem> = {};

  for (const group of groups) {
    const count = groupCount(group, selection);
    const chosen = group.options.filter((option) => quantityOf(selection, option.id) > 0);

    if (chosen.some((option) => option.soldOut)) problems[group.id] = "soldOut";
    else if (count < group.min) problems[group.id] = "min";
    else if (count > group.max) problems[group.id] = "max";
    else if (!group.repeat && chosen.some((option) => quantityOf(selection, option.id) > 1)) {
      problems[group.id] = "repeat";
    }
  }

  return problems;
}

export type ChosenOption = { id: string; group: string; name: string; quantity: number; price: number };

// Lo elegido como lista, en el orden del menú.
export function chosenOptions(groups: ManualOptionGroup[], selection: Selection): ChosenOption[] {
  return groups.flatMap((group) =>
    group.options
      .filter((option) => quantityOf(selection, option.id) > 0)
      .map((option) => ({
        id: option.id,
        group: group.name,
        name: option.name,
        quantity: quantityOf(selection, option.id),
        price: option.price,
      })),
  );
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

// Precio de una unidad: el del producto más los extras elegidos (el mismo cálculo de la base).
export function unitPriceWith(basePrice: number, chosen: ChosenOption[]): number {
  return round2(basePrice + chosen.reduce((sum, option) => sum + option.price * option.quantity, 0));
}

// Texto corto de lo elegido: "Queso, Frutilla ×2".
export function describeChosen(chosen: ChosenOption[]): string {
  return chosen.map((option) => (option.quantity > 1 ? `${option.name} ×${option.quantity}` : option.name)).join(", ");
}
