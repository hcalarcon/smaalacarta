import { paymentBadge, type PaymentTone } from "@/lib/orders/payment";

const TONES: Record<PaymentTone, string> = {
  warning: "bg-amber-100 text-amber-800",
  success: "bg-emerald-100 text-emerald-800",
  danger: "bg-red-100 text-red-700",
};

// "Esperando pago" / "Pagado" / "Pago fallido" (ADMIN-PEDIDOS-17); nada si el pedido no es con Mercado Pago.
export default function PaymentBadge({ status }: { status: string | null | undefined }) {
  const badge = paymentBadge(status);
  if (!badge) return null;

  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${TONES[badge.tone]}`}>
      {badge.label}
    </span>
  );
}
