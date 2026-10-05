import type { ValidationResult } from "@/lib/auth/validation";

// Pedidos programados (ADMIN-CONFIG-16 y 17): si el negocio los acepta y con cuántos minutos de
// anticipación como mínimo. Los mismos límites que la restricción de la base.
export const LEAD_MIN = 15;
export const LEAD_MAX = 240;
export const DEFAULT_LEAD = 30;

export type ScheduledOrdersInput = {
  allowScheduledOrders: boolean;
  scheduledLeadMinutes: number;
};

type Field = "scheduledLeadMinutes";

const isValidLead = (minutes: number) =>
  Number.isInteger(minutes) && minutes >= LEAD_MIN && minutes <= LEAD_MAX;

// Con los pedidos programados apagados el campo está oculto: unos minutos inválidos no tienen que
// bloquear el guardado ni llegar a la base, así que vuelven al valor por defecto.
export function normalizeScheduledOrders<T extends ScheduledOrdersInput>(input: T): T {
  if (!input.allowScheduledOrders && !isValidLead(input.scheduledLeadMinutes)) {
    return { ...input, scheduledLeadMinutes: DEFAULT_LEAD };
  }
  return input;
}

export function validateScheduledOrders(input: ScheduledOrdersInput): ValidationResult<Field> {
  if (input.allowScheduledOrders && !isValidLead(input.scheduledLeadMinutes)) {
    return {
      ok: false,
      errors: {
        scheduledLeadMinutes: `Ingresá un número entero de ${LEAD_MIN} a ${LEAD_MAX} minutos.`,
      },
    };
  }
  return { ok: true };
}
