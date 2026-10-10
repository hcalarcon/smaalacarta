"use client";

import type { Order } from "@/lib/db/orders";
import { timeAgo } from "@/lib/orders/format";
import PaymentBadge from "./PaymentBadge";
import SettlementStatus from "./SettlementStatus";
import { itemOptionLines } from "@/lib/orders/item-options";
import {
  confirmBlockReason,
  courierActions,
  courierStatusLabel,
  deliveryContext,
  feeSummary,
  hasCourier,
  noResponseWarning,
} from "@/lib/orders/courier";
import { isPaymentPending, PAYMENT_BLOCK_REASON } from "@/lib/orders/payment";
import { orderBadge } from "@/lib/orders/scheduled";
import { primaryAction, STATUS_LABELS, type OrderStatus } from "@/lib/orders/status";
import { formatMoney } from "@/lib/promotions/pricing";

const SHOWN_ITEMS = 3;

export default function OrderCard({
  order,
  now,
  busy,
  onAdvance,
  onOpen,
  onConfirmSettlement,
}: {
  order: Order;
  now: Date;
  busy: boolean;
  onAdvance: (status: string) => void;
  onOpen: () => void;
  onConfirmSettlement?: () => void;
}) {
  const withCourier = hasCourier(order);
  const action = primaryAction(order.status, deliveryContext(order));
  const extra = order.order_items.length - SHOWN_ITEMS;
  const scheduled = orderBadge(order);
  const paymentBlocked = isPaymentPending(order.payment_status);
  // Con envío, confirmar espera a que el repartidor acepte (ENVIO-8): la base también lo exige.
  const courierBlock = confirmBlockReason(order);
  const blocked = paymentBlocked || Boolean(courierBlock);
  const blockReason = paymentBlocked ? PAYMENT_BLOCK_REASON : (courierBlock ?? undefined);
  const courierRequest = courierActions(order).request;
  const fee = withCourier ? feeSummary(order) : null;
  const warning = withCourier ? noResponseWarning(order, now) : null;

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

      {scheduled ? (
        <p className="mt-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
          🕒 {scheduled}
        </p>
      ) : null}

      {order.payment_status && order.payment_status !== "not_required" ? (
        <p className="mt-2">
          <PaymentBadge status={order.payment_status} />
        </p>
      ) : null}

      {withCourier && fee ? (
        <div className="mt-2 rounded-lg bg-sky-50 px-2 py-1.5 text-[11px] text-sky-900">
          <p className="font-semibold">
            🛵 {order.delivery_zone_name ?? "Envío"} · {fee.price}
          </p>
          <p>{courierStatusLabel(order)}</p>
          {fee.list ? (
            <p>
              Antes {fee.list}
              {fee.reason ? `: ${fee.reason}` : ""}
            </p>
          ) : null}
          {warning ? (
            <p role="alert" className="mt-1 font-semibold text-red-700">
              {warning}
            </p>
          ) : null}
        </div>
      ) : null}

      <SettlementStatus order={order} busy={busy} onReceived={onConfirmSettlement} />

      <ul className="mt-2 space-y-0.5 text-xs text-stone-600">
        {order.order_items.slice(0, SHOWN_ITEMS).map((item, index) => (
          <li key={index}>
            <span className="block truncate">
              {item.quantity} × {item.name}
            </span>
            {itemOptionLines(item.options).map((line) => (
              <span key={line} className="block truncate pl-3 text-[11px] text-stone-500">
                {line}
              </span>
            ))}
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
            disabled={busy || blocked}
            title={blocked ? blockReason : undefined}
            className="flex-1 rounded-lg bg-brand px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60"
          >
            {busy ? "Guardando…" : action.label}
          </button>
        ) : null}
        {courierRequest ? (
          // Pedir el envío necesita la hora de listo y abre WhatsApp: se hace desde el detalle.
          <button
            type="button"
            onClick={onOpen}
            className="rounded-lg border border-line-strong px-2.5 py-1.5 text-xs font-semibold text-brand transition hover:bg-brand-soft"
          >
            {courierRequest}
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

      {blocked ? <p className="mt-1.5 text-[11px] text-stone-500">{blockReason}</p> : null}
    </article>
  );
}
