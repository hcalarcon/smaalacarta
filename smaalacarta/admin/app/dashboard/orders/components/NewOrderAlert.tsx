"use client";

import { useEffect, useRef } from "react";

import type { Order } from "@/lib/db/orders";
import { formatMoney } from "@/lib/promotions/pricing";

// La tarjeta a pantalla completa de un pedido sin atender (ADMIN-PEDIDOS-24). Solo pinta: qué pedidos
// cuentan y cuándo suena lo deciden `urgent-alert.ts` y `OrdersClient`.
export default function NewOrderAlert({
  order,
  moreCount,
  busy,
  canSilence,
  silenced,
  onAccept,
  onView,
  onSilence,
}: {
  order: Order;
  // Cuántos pedidos sin atender hay además de este.
  moreCount: number;
  busy: boolean;
  // El sonido está activado: tiene sentido ofrecer silenciarlo.
  canSilence: boolean;
  silenced: boolean;
  onAccept: () => void;
  onView: () => void;
  onSilence: () => void;
}) {
  const acceptRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    acceptRef.current?.focus();
  }, [order.id]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onView();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onView]);

  const items = order.order_items ?? [];
  const total = Number(order.total);
  const delivery =
    order.delivery === "delivery" ? "Envío a domicilio" : order.delivery === "retiro" ? "Retiro en el local" : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-red-800/95 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="new-order-alert-title"
        className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl sm:p-8"
      >
        <p className="text-sm font-semibold uppercase tracking-wide text-red-700 motion-safe:animate-pulse">
          Pedido sin atender
        </p>
        <h2 id="new-order-alert-title" className="mt-1 text-3xl font-extrabold text-brand sm:text-4xl">
          NUEVO PEDIDO #{order.order_number}
        </h2>

        <div className="mt-4 space-y-1 text-stone-700">
          {order.customer_name ? <p className="text-lg font-semibold">{order.customer_name}</p> : null}
          {delivery ? <p>{delivery}</p> : null}
        </div>

        {items.length > 0 ? (
          <ul className="mt-4 space-y-1 rounded-2xl bg-cream p-4 text-stone-800">
            {items.map((item, index) => (
              <li key={`${item.name}-${index}`}>
                {item.quantity} × {item.name}
                {item.note ? <span className="block text-sm text-stone-600">Nota: {item.note}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}

        {Number.isFinite(total) ? (
          <p className="mt-4 text-2xl font-bold text-brand">{formatMoney(total)}</p>
        ) : null}

        {moreCount > 0 ? (
          <p className="mt-2 text-sm font-medium text-red-700">
            {moreCount === 1 ? "1 pedido más sin atender" : `${moreCount} pedidos más sin atender`}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-3">
          <button
            ref={acceptRef}
            type="button"
            disabled={busy}
            onClick={onAccept}
            className="min-h-14 rounded-2xl bg-brand px-6 py-4 text-xl font-bold text-white transition hover:bg-brand-hover disabled:opacity-60"
          >
            Aceptar
          </button>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onView}
              className="min-h-12 flex-1 rounded-2xl border border-line-strong bg-white px-5 py-3 font-semibold text-brand transition hover:bg-cream"
            >
              Ver pedidos
            </button>

            {canSilence ? (
              <button
                type="button"
                disabled={silenced}
                onClick={onSilence}
                className="min-h-12 flex-1 rounded-2xl border border-line-strong bg-white px-5 py-3 font-semibold text-stone-700 transition hover:bg-cream disabled:opacity-60"
              >
                {silenced ? "🔕 Silenciado por 5 min" : "🔕 Silenciar 5 min"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
