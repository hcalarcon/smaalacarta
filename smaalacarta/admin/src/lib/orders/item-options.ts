// Las opciones y extras que el cliente eligió en un ítem del pedido (PUBLICO-42): la foto guardada
// en `order_items.options`. Reglas puras: el tablero, el detalle y el cobro con Mercado Pago las
// muestran igual.

export type OrderItemOption = {
  grupo?: string;
  nombre: string;
  cantidad: number;
  precio?: number;
};

// Lo que llega de la base puede ser NULL (ítem sin opciones, pedido anterior o manual); se descarta
// cualquier cosa que no tenga forma de opción.
function validOptions(options: unknown): OrderItemOption[] {
  if (!Array.isArray(options)) return [];

  return options.filter(
    (option): option is OrderItemOption =>
      !!option &&
      typeof option === "object" &&
      typeof (option as OrderItemOption).nombre === "string" &&
      (option as OrderItemOption).nombre !== "",
  );
}

const label = (option: OrderItemOption) =>
  Number(option.cantidad) > 1 ? `${option.nombre} ×${option.cantidad}` : option.nombre;

// Una línea por opción, para mostrar bajo el ítem: "+ Queso", "+ Frutilla ×2" (ADMIN-PEDIDOS-20).
export function itemOptionLines(options: OrderItemOption[] | null | undefined): string[] {
  return validOptions(options).map((option) => `+ ${label(option)}`);
}

const MAX_TITLE = 250;

// El título del ítem en la preferencia de Mercado Pago: el nombre y, entre paréntesis, lo elegido
// (MP-8). Se corta antes del límite de la API.
export function itemTitle(name: string, options: OrderItemOption[] | null | undefined): string {
  const chosen = validOptions(options);
  if (chosen.length === 0) return name;

  const title = `${name} (${chosen.map(label).join(", ")})`;
  return title.length <= MAX_TITLE ? title : `${title.slice(0, MAX_TITLE - 1).trimEnd()}…`;
}
