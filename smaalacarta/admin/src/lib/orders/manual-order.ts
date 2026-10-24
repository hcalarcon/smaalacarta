import type { ValidationResult } from "@/lib/auth/validation";

import { TIME_PATTERN } from "./scheduled";

// Un producto o promoción del menú, con lo que eligió el local. El precio es solo para mostrar: la base
// lo calcula y el navegador manda `id`, opciones y cantidad (ADMIN-PEDIDOS-40).
export type ManualMenuLine = {
  kind: "product" | "promo";
  id: string;
  name: string;
  // Precio de una unidad con los extras elegidos.
  unitPrice: number;
  quantity: number;
  note?: string;
  options?: { id: string; name: string; quantity: number; price: number }[];
  // Solo en las promociones con opciones (ADMIN-PROMOS-8): lo elegido en cada unidad de cada producto.
  components?: ManualLineComponent[];
};

export type ManualLineComponent = {
  productId: string;
  name: string;
  options: { id: string; name: string; quantity: number; price: number }[];
};

// Un producto libre (ADMIN-PEDIDOS-42): nombre y precio a mano, para los casos raros.
export type ManualFreeLine = {
  kind: "free";
  name: string;
  unitPrice: number;
  quantity: number;
  note?: string;
};

export type ManualOrderItem = ManualMenuLine | ManualFreeLine;

// La entrega y el pago del pedido manual son fijos (ADMIN-PEDIDOS-43 y 44). El negocio solo ofrece los que
// tiene habilitados: la base lo vuelve a comprobar.
export const MANUAL_DELIVERIES = ["retiro", "delivery", "local"] as const;
export const MANUAL_PAYMENTS = ["efectivo", "transferencia", "tarjeta", "qr"] as const;
export const COURIER_MODES = ["favorite", "offers", "self", "own"] as const;

export type ManualDelivery = (typeof MANUAL_DELIVERIES)[number];
export type ManualCourierMode = (typeof COURIER_MODES)[number];

export type ManualOrderInput = {
  customerName: string;
  delivery: string;
  payment: string;
  notes: string;
  items: ManualOrderItem[];
  // "HH:MM" de hoy, o vacío (lo antes posible).
  scheduledFor?: string;
  phone?: string;
  // Con envío con repartidor (ENVIO-137): barrio, dirección y qué hacer con el envío.
  zoneId?: string;
  // Sin zona con precio (ENVIO-252): el barrio escrito a mano; el costo se coordina con el cliente.
  zoneText?: string;
  address?: string;
  courierMode?: string;
};

type Field =
  | "customerName"
  | "delivery"
  | "payment"
  | "notes"
  | "items"
  | "scheduledFor"
  | "phone"
  | "zoneId"
  | "address"
  | "courierMode";

// Los mismos límites que `create_manual_order` en la base de datos.
export const LIMITS = {
  zoneText: 80,
  customerName: 80,
  notes: 500,
  itemName: 100,
  itemNote: 140,
  maxPrice: 9_999_999.99,
  maxItems: 40,
  maxQuantity: 99,
  phoneMin: 8,
  phoneMax: 15,
  addressMin: 5,
  addressMax: 200,
} as const;

// De 8 a 15 dígitos, con o sin separadores: lo mismo que exige el menú y la base.
export function phoneDigits(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

export function isValidPhone(value: string | null | undefined): boolean {
  const length = phoneDigits(value).length;
  return length >= LIMITS.phoneMin && length <= LIMITS.phoneMax;
}

// `courier`: el negocio tiene el envío con repartidor, así que un `delivery` lleva barrio, dirección y modo.
export function validateManualOrder(
  input: ManualOrderInput,
  context: { courier: boolean } = { courier: false },
): ValidationResult<Field> {
  const errors: Partial<Record<Field, string>> = {};

  const name = input.customerName.trim();
  if (name.length < 1 || name.length > LIMITS.customerName) {
    errors.customerName = `Ingresá el nombre del cliente (hasta ${LIMITS.customerName} caracteres).`;
  }

  const delivery = input.delivery.trim();
  if (!(MANUAL_DELIVERIES as readonly string[]).includes(delivery)) {
    errors.delivery = "Elegí cómo se entrega el pedido.";
  }

  if (!(MANUAL_PAYMENTS as readonly string[]).includes(input.payment.trim())) {
    errors.payment = "Elegí cómo paga el cliente.";
  }

  if (input.notes.trim().length > LIMITS.notes) {
    errors.notes = `Usá hasta ${LIMITS.notes} caracteres.`;
  }

  if (input.scheduledFor && !TIME_PATTERN.test(input.scheduledFor)) {
    errors.scheduledFor = "Ingresá una hora, por ejemplo 20:30.";
  }

  // Teléfono: obligatorio con envío; con retiro o consumo en el local es opcional, pero si se carga tiene
  // que ser válido (ADMIN-PEDIDOS-45).
  const phone = (input.phone ?? "").trim();
  if (delivery === "delivery" && !isValidPhone(phone)) {
    errors.phone = "Ingresá el teléfono del cliente (de 8 a 15 dígitos): hace falta para el envío.";
  } else if (phone !== "" && !isValidPhone(phone)) {
    errors.phone = "Revisá el teléfono: tiene que tener de 8 a 15 dígitos.";
  }

  const address = (input.address ?? "").trim();
  if (delivery === "delivery" && context.courier) {
    const zoneText = (input.zoneText ?? "").trim();
    if (!(input.zoneId ?? "").trim()) {
      if (zoneText === "") {
        errors.zoneId = "Elegí el barrio del envío.";
      } else if (zoneText.length > LIMITS.zoneText) {
        errors.zoneId = `El barrio admite hasta ${LIMITS.zoneText} caracteres.`;
      }
    }

    if (address.length < LIMITS.addressMin || address.length > LIMITS.addressMax) {
      errors.address = `Ingresá la dirección (de ${LIMITS.addressMin} a ${LIMITS.addressMax} caracteres).`;
    }

    if (!(COURIER_MODES as readonly string[]).includes((input.courierMode ?? "").trim())) {
      errors.courierMode = "Elegí cómo se resuelve el envío.";
    }
  } else if (address.length > LIMITS.addressMax) {
    errors.address = `Usá hasta ${LIMITS.addressMax} caracteres.`;
  }

  if (input.items.length < 1) {
    errors.items = "Agregá al menos un producto.";
  } else if (input.items.length > LIMITS.maxItems) {
    errors.items = `Un pedido lleva hasta ${LIMITS.maxItems} productos.`;
  } else if (input.items.some((item) => !isValidItem(item))) {
    errors.items =
      "Revisá los productos: nombre (hasta 100 caracteres), precio de 0 en adelante y cantidad de 1 a 99.";
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
}

function isValidItem(item: ManualOrderItem) {
  const name = item.name.trim();

  const common =
    name.length >= 1 &&
    name.length <= LIMITS.itemName &&
    Number.isInteger(item.quantity) &&
    item.quantity >= 1 &&
    item.quantity <= LIMITS.maxQuantity &&
    (item.note ?? "").trim().length <= LIMITS.itemNote;

  if (!common) return false;

  if (item.kind === "free") {
    return Number.isFinite(item.unitPrice) && item.unitPrice >= 0 && item.unitPrice <= LIMITS.maxPrice;
  }

  return (
    (item.kind === "product" || item.kind === "promo") &&
    typeof item.id === "string" &&
    item.id.trim() !== "" &&
    (item.options ?? []).every(isValidOption) &&
    (item.components ?? []).every(
      (component) =>
        typeof component.productId === "string" &&
        component.productId.trim() !== "" &&
        component.options.every(isValidOption),
    )
  );
}

const isValidOption = (option: { id: string; quantity: number }) =>
  typeof option.id === "string" && Number.isInteger(option.quantity) && option.quantity >= 1;

// Lo único que viaja a la base (ADMIN-PEDIDOS-40 y 42): los del menú, ids, opciones y cantidades, nunca
// precios; los libres, nombre y precio.
export function toRpcItems(items: ManualOrderItem[]) {
  return items.map((item) => {
    const note = (item.note ?? "").trim();
    const withNote = note ? { note } : {};

    if (item.kind === "free") {
      return { name: item.name.trim(), unit_price: item.unitPrice, quantity: item.quantity, ...withNote };
    }

    return {
      id: item.id,
      kind: item.kind,
      quantity: item.quantity,
      options: (item.options ?? []).map((option) => ({ id: option.id, quantity: option.quantity })),
      ...(item.components?.length
        ? {
            components: item.components.map((component) => ({
              product_id: component.productId,
              options: component.options.map((option) => ({ id: option.id, quantity: option.quantity })),
            })),
          }
        : {}),
      ...withNote,
    };
  });
}

// Total del pedido, en centavos para no arrastrar errores de coma flotante. Los
// productos con datos que no son números no suman. Es la cuenta que se le muestra al local: el total
// real lo calcula la base.
export function orderTotal(items: ManualOrderItem[]) {
  const cents = items.reduce((sum, item) => {
    const line = Math.round(item.unitPrice * 100) * item.quantity;
    return Number.isFinite(line) ? sum + line : sum;
  }, 0);

  return cents / 100;
}

// Qué línea es qué: el mismo producto con las mismas opciones y la misma nota es una sola línea (la base
// rechaza una línea repetida, ADMIN-PEDIDOS-40). Los libres nunca se juntan.
function lineKey(item: ManualOrderItem): string | null {
  if (item.kind === "free") return null;

  const options = [...(item.options ?? [])]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((option) => `${option.id}x${option.quantity}`)
    .join(",");

  // En una promoción también cuenta lo elegido en cada unidad, sin importar el orden de las unidades.
  const components = (item.components ?? [])
    .map(
      (component) =>
        `${component.productId}=${[...component.options]
          .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
          .map((option) => `${option.id}x${option.quantity}`)
          .join(",")}`,
    )
    .sort()
    .join(";");

  return `${item.kind}:${item.id}|${options}|${components}|${(item.note ?? "").trim()}`;
}

// Agrega una línea al pedido: si ya hay una igual, suma la cantidad (hasta el máximo).
export function addLine(items: ManualOrderItem[], line: ManualOrderItem): ManualOrderItem[] {
  const key = lineKey(line);
  const index = key === null ? -1 : items.findIndex((item) => lineKey(item) === key);

  if (index === -1) return [...items, line];

  return items.map((item, i) =>
    i === index ? { ...item, quantity: Math.min(LIMITS.maxQuantity, item.quantity + line.quantity) } : item,
  );
}

// Cambia la cantidad de una línea, entre 1 y el máximo.
export function setLineQuantity(items: ManualOrderItem[], index: number, quantity: number): ManualOrderItem[] {
  const clamped = Math.min(LIMITS.maxQuantity, Math.max(1, Math.floor(quantity) || 1));
  return items.map((item, i) => (i === index ? { ...item, quantity: clamped } : item));
}
