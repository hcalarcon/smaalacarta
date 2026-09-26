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
    <article className="rounded-xl border border-line bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-brand">
            #{order.order_number}
            {order.source === "manual" ? (
              <span className="ml-1.5 rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] font-medium text-brand">
                Manual
              </span>
            ) : null}
          </p>
          <p className="truncate text-xs text-stone-600">{order.customer_name || "Sin nombre"}</p>
        </div>

        <span className="shrink-0 text-[11px] text-stone-400">{timeAgo(order.created_at, now)}</span>
      </div>

      <ul className="mt-2 space-y-0.5 text-xs text-stone-600">
        {order.order_items.slice(0, SHOWN_ITEMS).map((item, index) => (
          <li key={index} className="truncate">
            {item.quantity} × {item.name}
          </li>
        ))}
        {extra > 0 ? <li className="text-stone-400">y {extra} más…</li> : null}
      </ul>

      <div className="mt-2 flex items-center justify-between">
        <span className="font-bold text-brand">{formatMoney(Number(order.total))}</span>
        <span className="text-[11px] text-stone-500">{STATUS_LABELS[order.status as OrderStatus] ?? order.status}</span>
      </div>

      <div className="mt-2 flex gap-1.5">
        {action ? (
          <button
            type="button"
            onClick={() => onAdvance(action.status)}
            disabled={busy}
            className="flex-1 rounded-lg bg-brand px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60"
          >
            {busy ? "Guardando…" : action.label}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onOpen}
          className="rounded-lg border border-line-strong px-2.5 py-1.5 text-xs font-medium text-brand transition hover:bg-brand-soft"
        >
          Detalle
        </button>
      </div>
    </article>
  );
}
