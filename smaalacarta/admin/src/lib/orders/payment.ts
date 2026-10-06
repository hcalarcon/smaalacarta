// Estado de pago de un pedido (ADMIN-PEDIDOS-17 y 18). Solo los pedidos con Mercado Pago lo
// usan; el resto queda en `not_required`. La regla de bloqueo es la misma que `set_order_status`.
export type PaymentTone = "warning" | "success" | "danger";

const BADGES: Record<string, { label: string; tone: PaymentTone }> = {
  awaiting: { label: "Esperando pago", tone: "warning" },
  paid: { label: "Pagado", tone: "success" },
  failed: { label: "Pago fallido", tone: "danger" },
};

export const PAYMENT_BLOCK_REASON =
  "Esperando el pago de Mercado Pago: mientras tanto solo se puede cancelar el pedido.";

export function paymentBadge(paymentStatus: string | null | undefined) {
  return (paymentStatus && BADGES[paymentStatus]) || null;
}

// Sin pagar (o con el último pago rechazado): el pedido no avanza, solo se cancela.
export function isPaymentPending(paymentStatus: string | null | undefined) {
  return paymentStatus === "awaiting" || paymentStatus === "failed";
}
