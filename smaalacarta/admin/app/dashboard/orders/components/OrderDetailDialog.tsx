"use client";

import { useEffect, useState } from "react";

import type { Order } from "@/lib/db/orders";
import { trackingUrl } from "@/lib/orders/format";
import { nextStatuses, STATUS_LABELS, type OrderStatus } from "@/lib/orders/status";
import { formatMoney } from "@/lib/promotions/pricing";

const label = (status: string) => STATUS_LABELS[status as OrderStatus] ?? status;

const dateTime = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Argentina/Buenos_Aires",
});

export default function OrderDetailDialog({
  order,
  slug,
  busy,
  onClose,
  onChangeStatus,
}: {
  order: Order | null;
  slug: string;
  busy: boolean;
  onClose: () => void;
  onChangeStatus: (status: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  // Escape cierra el diálogo.
  useEffect(() => {
    if (!order) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [order, onClose]);

  if (!order) return null;

  const link = trackingUrl(slug, order.code);
  const options = nextStatuses(order.status);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // Sin permiso para el portapapeles: el link queda visible para copiarlo a mano.
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Pedido ${order.order_number}`}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-brand">Pedido #{order.order_number}</h2>
            <p className="mt-1 text-sm text-stone-500">
              {order.customer_name || "Sin nombre"} · {label(order.status)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg px-2 py-1 text-stone-500 hover:bg-brand-soft"
          >
            ✕
          </button>
        </div>

        <ul className="mt-5 divide-y divide-line">
          {order.order_items.map((item, index) => (
            <li key={index} className="flex items-baseline justify-between gap-3 py-2 text-sm">
              <span className="min-w-0 text-stone-800">
                {item.quantity} × {item.name}
              </span>
              <span className="shrink-0 text-stone-600">
                {formatMoney(Number(item.unit_price) * item.quantity)}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
          <span className="font-medium text-stone-700">Total</span>
          <span className="text-xl font-bold text-brand">{formatMoney(Number(order.total))}</span>
        </p>

        <dl className="mt-5 space-y-1 text-sm text-stone-600">
          {order.delivery ? (
            <div className="flex gap-2"><dt className="text-stone-400">Entrega:</dt><dd>{order.delivery}</dd></div>
          ) : null}
          {order.payment ? (
            <div className="flex gap-2"><dt className="text-stone-400">Pago:</dt><dd>{order.payment}</dd></div>
          ) : null}
          {order.notes ? (
            <div className="flex gap-2"><dt className="text-stone-400">Notas:</dt><dd className="whitespace-pre-wrap">{order.notes}</dd></div>
          ) : null}
        </dl>

        <div className="mt-6">
          <h3 className="text-sm font-semibold text-brand">Línea de tiempo</h3>
          <ol className="mt-2 space-y-1 text-sm text-stone-600">
            {order.order_events.map((event, index) => (
              <li key={index} className="flex justify-between gap-3">
                <span>{label(event.status)}</span>
                <span className="text-stone-400">{dateTime.format(new Date(event.created_at))}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-6 rounded-2xl bg-cream p-4">
          <h3 className="text-sm font-semibold text-brand">Seguimiento del cliente</h3>
          <p className="mt-1 break-all text-xs text-stone-500">{link}</p>
          <button
            type="button"
            onClick={copy}
            className="mt-2 rounded-xl border border-line-strong bg-white px-3 py-1.5 text-sm font-medium text-brand transition hover:bg-brand-soft"
          >
            {copied ? "Copiado" : "Copiar link"}
          </button>
        </div>

        {options.length > 0 ? (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-brand">Cambiar estado</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {options.map((status) => (
                <button
                  key={status}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (
                      status === "cancelled" &&
                      !window.confirm("¿Cancelar este pedido? No se puede deshacer.")
                    ) {
                      return;
                    }
                    onChangeStatus(status);
                  }}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition disabled:opacity-60 ${
                    status === "cancelled"
                      ? "text-red-600 hover:bg-red-50"
                      : "border border-line-strong text-brand hover:bg-brand-soft"
                  }`}
                >
                  {label(status)}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
