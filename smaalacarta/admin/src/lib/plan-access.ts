import type { BusinessPlan } from "./menu-url";

// Qué funciones del panel tienen sentido según el plan del negocio (no
// solo qué URL pública responde, RUTAS-4): un negocio sin `plan_web` ni
// `plan_completo` no tiene un menú digital (categorías, productos,
// promociones, apariencia) — solo un PDF que sube y comparte. Pedidos
// (carrito) es exclusivo de `plan_completo`: sin él no hay checkout del que
// puedan llegar pedidos.
export function hasDigitalMenu(plan: BusinessPlan) {
  return plan.planWeb || plan.planCompleto;
}

export function hasOrders(plan: BusinessPlan) {
  return plan.planCompleto;
}
