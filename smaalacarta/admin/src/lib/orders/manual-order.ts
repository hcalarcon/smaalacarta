import type { ValidationResult } from "@/lib/auth/validation";

export type ManualOrderItem = {
  name: string;
  unitPrice: number;
  quantity: number;
};

export type ManualOrderInput = {
  customerName: string;
  delivery: string;
  payment: string;
  notes: string;
  items: ManualOrderItem[];
};

type Field = "customerName" | "delivery" | "payment" | "notes" | "items";

// Los mismos límites que `create_manual_order` en la base de datos.
export const LIMITS = {
  customerName: 80,
  delivery: 30,
  payment: 30,
  notes: 500,
  itemName: 100,
  maxPrice: 9_999_999.99,
  maxItems: 40,
  maxQuantity: 99,
} as const;

export function validateManualOrder(input: ManualOrderInput): ValidationResult<Field> {
  const errors: Partial<Record<Field, string>> = {};

  const name = input.customerName.trim();
  if (name.length < 1 || name.length > LIMITS.customerName) {
    errors.customerName = `Ingresá el nombre del cliente (hasta ${LIMITS.customerName} caracteres).`;
  }

  if (input.delivery.trim().length > LIMITS.delivery) {
    errors.delivery = `Usá hasta ${LIMITS.delivery} caracteres.`;
  }

  if (input.payment.trim().length > LIMITS.payment) {
    errors.payment = `Usá hasta ${LIMITS.payment} caracteres.`;
  }

  if (input.notes.trim().length > LIMITS.notes) {
    errors.notes = `Usá hasta ${LIMITS.notes} caracteres.`;
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

  return (
    name.length >= 1 &&
    name.length <= LIMITS.itemName &&
    Number.isFinite(item.unitPrice) &&
    item.unitPrice >= 0 &&
    item.unitPrice <= LIMITS.maxPrice &&
    Number.isInteger(item.quantity) &&
    item.quantity >= 1 &&
    item.quantity <= LIMITS.maxQuantity
  );
}

// Total del pedido, en centavos para no arrastrar errores de coma flotante. Los
// productos con datos que no son números no suman.
export function orderTotal(items: ManualOrderItem[]) {
  const cents = items.reduce((sum, item) => {
    const line = Math.round(item.unitPrice * 100) * item.quantity;
    return Number.isFinite(line) ? sum + line : sum;
  }, 0);

  return cents / 100;
}
