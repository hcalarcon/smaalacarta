"use client";

import type { Order } from "@/lib/db/orders";
import { canConfirmReceived, localOrderState, settlementLabel } from "@/lib/courier/settlements";

const TONE = {
  to_settle: "bg-amber-50 text-amber-900",
  settled: "bg-sky-50 text-sky-900",
  received: "bg-emerald-50 text-emerald-800",
} as const;

// Estado de la rendición del efectivo de un pedido con envío (ENVIO-43): "A rendir $X",
// "Rendido, esperando confirmación" o "Recibido por el local". Cuando el repartidor ya la marcó, el
// local la confirma con "Recibido" (la confirmación la pide quien usa este componente).
export default function SettlementStatus({
  order,
  busy = false,
  onReceived,
}: {
  order: Order;
  busy?: boolean;
  onReceived?: () => void;
}) {
  const state = localOrderState(order);
  if (state === "none") return null;

  return (
    <div className={`mt-2 rounded-lg px-2 py-1.5 text-[11px] ${TONE[state]}`}>
      <p className="font-semibold">💵 {settlementLabel(state, Number(order.total))}</p>
      {state === "to_settle" ? <p>El repartidor cobró el pedido en efectivo y lo rinde al local.</p> : null}

      {canConfirmReceived(state) && onReceived ? (
        <button
          type="button"
          disabled={busy}
          onClick={onReceived}
          className="mt-1 rounded-lg bg-brand px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60"
        >
          Recibido
        </button>
      ) : null}
    </div>
  );
}
