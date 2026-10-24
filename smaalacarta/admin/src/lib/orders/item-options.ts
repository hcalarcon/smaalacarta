// Las opciones y extras que el cliente eligió en un ítem del pedido (PUBLICO-42): la foto guardada
// en `order_items.options`. Reglas puras: el tablero, el detalle y el cobro con Mercado Pago las
// muestran igual. En una promoción (ADMIN-PROMOS-9) la foto es una lista de componentes, uno por
// unidad: `[{producto, opciones: [...]}]`.

export type OrderItemOption = {
  grupo?: string;
  nombre: string;
  cantidad: number;
  precio?: number;
};

// Una unidad de un producto dentro de una promoción, con lo que se eligió en ella.
export type OrderItemComponent = {
  producto: string;
  opciones?: OrderItemOption[];
};

function isComponent(value: unknown): value is OrderItemComponent {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as OrderItemComponent).producto === "string" &&
    (value as OrderItemComponent).producto !== ""
  );
}

// "Empanada clásica: Carne" o, sin elecciones, "Gaseosas".
function componentLabel(component: OrderItemComponent) {
  const chosen = validOptions(component.opciones);
  return chosen.length === 0
    ? component.producto
    : `${component.producto}: ${chosen.map(label).join(", ")}`;
}

// Las unidades iguales se juntan: "2× Empanada clásica: Carne".
function componentLines(components: OrderItemComponent[]): string[] {
  const counts = new Map<string, number>();
  for (const component of components) {
    const text = componentLabel(component);
    counts.set(text, (counts.get(text) ?? 0) + 1);
  }

  return [...counts].map(([text, count]) => (count > 1 ? `${count}× ${text}` : text));
}

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

// Una línea por opción, para mostrar bajo el ítem: "+ Queso", "+ Frutilla ×2" (ADMIN-PEDIDOS-20). En una
// promoción, una línea por unidad: "3× Empanada clásica: Carne", "Gaseosas: Coca" (ADMIN-PROMOS-9).
export function itemOptionLines(options: unknown): string[] {
  if (Array.isArray(options) && options.some(isComponent)) {
    return componentLines(options.filter(isComponent));
  }

  return validOptions(options).map((option) => `+ ${label(option)}`);
}

const MAX_TITLE = 250;

// El título del ítem en la preferencia de Mercado Pago: el nombre y, entre paréntesis, lo elegido
// (MP-8). Se corta antes del límite de la API.
export function itemTitle(name: string, options: unknown): string {
  const chosen = Array.isArray(options) && options.some(isComponent)
    ? componentLines(options.filter(isComponent))
    : validOptions(options).map(label);
  if (chosen.length === 0) return name;

  const title = `${name} (${chosen.join(", ")})`;
  return title.length <= MAX_TITLE ? title : `${title.slice(0, MAX_TITLE - 1).trimEnd()}…`;
}
