"use client";

import type { Order } from "@/lib/db/orders";
import { timeAgo } from "@/lib/orders/format";
import { primaryAction, STATUS_LABELS, type OrderStatus } from "@/lib/orders/status";
import { formatMoney } from "@/lib/promotions/pricing";

const SHOWN_ITEMS = 3;

export default function OrderCard({
  order,
  now,
  busy,
  onAdvance,
  onOpen,
}: {
  order: Order;
  now: Date;
  busy: boolean;
  onAdvance: (status: string) => void;
  onOpen: () => void;
}) {
  const action = primaryAction(order.status);
  const extra = order.order_items.length - SHOWN_ITEMS;

  return (
    <article className="rounded-2xl border border-line bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-brand">
            #{order.order_number}
            {order.source === "manual" ? (
              <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand">
                Manual
              </span>
            ) : null}
          </p>
          <p className="truncate text-sm text-stone-700">{order.customer_name || "Sin nombre"}</p>
        </div>

        <span className="shrink-0 text-xs text-stone-400">{timeAgo(order.created_at, now)}</span>
      </div>

      <ul className="mt-3 space-y-0.5 text-sm text-stone-600">
        {order.order_items.slice(0, SHOWN_ITEMS).map((item, index) => (
          <li key={index} className="truncate">
            {item.quantity} × {item.name}
          </li>
        ))}
        {extra > 0 ? <li className="text-stone-400">y {extra} más…</li> : null}
      </ul>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-lg font-bold text-brand">{formatMoney(Number(order.total))}</span>
        <span className="text-xs text-stone-500">{STATUS_LABELS[order.status as OrderStatus] ?? order.status}</span>
      </div>

      <div className="mt-3 flex gap-2">
        {action ? (
          <button
            type="button"
            onClick={() => onAdvance(action.status)}
            disabled={busy}
            className="flex-1 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60"
          >
            {busy ? "Guardando…" : action.label}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onOpen}
          className="rounded-xl border border-line-strong px-3 py-2 text-sm font-medium text-brand transition hover:bg-brand-soft"
        >
          Detalle
        </button>
      </div>
    </article>
  );
}
