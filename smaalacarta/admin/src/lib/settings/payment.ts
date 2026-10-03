import type { ValidationResult } from "@/lib/auth/validation";

// Qué entrega y qué medios de pago ofrece el negocio, y los datos de su transferencia
// (ADMIN-CONFIG-11 a 13). Los valores son los mismos que acepta la base.
export const DELIVERY_OPTIONS = [
  { key: "delivery", label: "Delivery" },
  { key: "retiro", label: "Retiro en el local" },
] as const;

export const PAYMENT_OPTIONS = [
  { key: "efectivo", label: "Efectivo" },
  { key: "transferencia", label: "Transferencia" },
  { key: "tarjeta", label: "Crédito o débito" },
] as const;

export const ALL_DELIVERY = DELIVERY_OPTIONS.map((o) => o.key) as string[];
export const ALL_PAYMENT = PAYMENT_OPTIONS.map((o) => o.key) as string[];

export type DeliveryPaymentInput = {
  deliveryOptions: string[];
  paymentOptions: string[];
  transferAlias: string;
  transferCbu: string;
};

type Field = keyof DeliveryPaymentInput;

// Letras, números, punto y guion, de 6 a 20 (mismo criterio que la base).
const ALIAS = /^[A-Za-z0-9.-]{6,20}$/;
const CBU = /^[0-9]{22}$/;

export const hasTransfer = (paymentOptions: string[]) =>
  paymentOptions.includes("transferencia");

export const normalizeAlias = (value: string) => value.trim();

// El CBU se copia de la app del banco con espacios o guiones: se dejan solo los dígitos.
export const normalizeCbu = (value: string) => value.replace(/[\s-]/g, "");

// Normaliza alias y CBU y los descarta si "transferencia" no está tildada: un dato de un
// medio de pago que el negocio ya no ofrece no tiene que quedar guardado.
export function normalizeDeliveryPayment<T extends DeliveryPaymentInput>(input: T): T {
  if (!hasTransfer(input.paymentOptions)) {
    return { ...input, transferAlias: "", transferCbu: "" };
  }

  return {
    ...input,
    transferAlias: normalizeAlias(input.transferAlias),
    transferCbu: normalizeCbu(input.transferCbu),
  };
}

export function validateDeliveryPayment(
  input: DeliveryPaymentInput,
): ValidationResult<Field> {
  const errors: Partial<Record<Field, string>> = {};

  if (
    input.deliveryOptions.length === 0 ||
    !input.deliveryOptions.every((o) => ALL_DELIVERY.includes(o))
  ) {
    errors.deliveryOptions = "Elegí al menos un tipo de entrega.";
  }

  if (
    input.paymentOptions.length === 0 ||
    !input.paymentOptions.every((o) => ALL_PAYMENT.includes(o))
  ) {
    errors.paymentOptions = "Elegí al menos un medio de pago.";
  }

  // Sin transferencia, alias y CBU se descartan al guardar: no hay nada que validar.
  if (hasTransfer(input.paymentOptions)) {
    const alias = normalizeAlias(input.transferAlias);
    const cbu = normalizeCbu(input.transferCbu);

    if (alias && !ALIAS.test(alias)) {
      errors.transferAlias =
        "El alias lleva de 6 a 20 caracteres: letras, números, punto o guion.";
    }

    if (cbu && !CBU.test(cbu)) {
      errors.transferCbu = "El CBU o CVU lleva 22 números.";
    }
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
}
