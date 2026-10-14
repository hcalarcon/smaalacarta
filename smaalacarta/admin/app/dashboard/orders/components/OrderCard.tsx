"use client";

import { useState } from "react";

import type { Order } from "@/lib/db/orders";
import { timeAgo } from "@/lib/orders/format";
import CustomerPhone from "./CustomerPhone";
import PaymentBadge from "./PaymentBadge";
import SettlementStatus from "./SettlementStatus";
import { itemOptionLines } from "@/lib/orders/item-options";
import {
  courierStatusLabel,
  deliveryContext,
  feeSummary,
  hasDelivery,
  offersLabel,
  searchWarning,
  type OrderCourier,
  type OrderOffers,
} from "@/lib/orders/courier";
import { isPaymentPending, PAYMENT_BLOCK_REASON } from "@/lib/orders/payment";
import { acceptsPrepTime, PREP_REASON_LABELS, PREP_REASONS, prepBadge } from "@/lib/orders/prep";
import { orderBadge } from "@/lib/orders/scheduled";
import { isFinal, primaryAction, STATUS_LABELS, type OrderStatus } from "@/lib/orders/status";
import { formatMoney } from "@/lib/promotions/pricing";
import ItemNote from "@/components/ui/ItemNote";

const SHOWN_ITEMS = 3;

export default function OrderCard({
  order,
  now,
  busy,
  onAdvance,
  onOpen,
  onConfirmSettlement,
  couriers = [],
  offers,
  onSetPrep,
  onDelay,
}: {
  order: Order;
  now: Date;
  busy: boolean;
  onAdvance: (status: string) => void;
  onOpen: () => void;
  onConfirmSettlement?: () => void;
  // Los repartidores del local: sirven para nombrar al que tomó el pedido y al favorito.
  couriers?: OrderCourier[];
  // Las ofertas abiertas del pedido si está buscando repartidor (ENVIO-117).
  offers?: OrderOffers;
  // Tiempo estimado (ADMIN-PEDIDOS-34 y 35): cargarlo en un pedido aceptado sin tiempo, o demorarlo con
  // un motivo opcional (nulo = sin motivo).
  onSetPrep?: () => void;
  onDelay?: (reason: string | null) => void;
}) {
  const [choosingReason, setChoosingReason] = useState(false);
  const withDelivery = hasDelivery(order);
  const action = primaryAction(order.status, deliveryContext(order));
  const extra = order.order_items.length - SHOWN_ITEMS;
  const scheduled = orderBadge(order);
  const paymentBlocked = isPaymentPending(order.payment_status);
  const blocked = paymentBlocked;
  const blockReason = paymentBlocked ? PAYMENT_BLOCK_REASON : undefined;
  const fee = withDelivery ? feeSummary(order) : null;
  const searching = withDelivery && order.courier_status === "searching" && !isFinal(order.status);
  const warning = withDelivery ? searchWarning(order, now, offers?.ofertas.length ?? 0) : null;
  // El tiempo solo cuenta en un pedido aceptado y en preparación, sin hora propia.
  const inKitchen =
    (order.status === "confirmed" || order.status === "preparing") && acceptsPrepTime(order);
  const prep = prepBadge(order, now);
  const courierName = order.courier_id
    ? couriers.find((courier) => courier.id === order.courier_id)?.name
    : undefined;

  return (
    <article
      className={`rounded-xl border p-3 shadow-sm ${
        prep?.late ? "border-red-300 bg-red-50" : "border-line bg-white"
      }`}
    >
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

      {prep ? (
        <p
          className={`mt-2 text-sm font-semibold ${prep.late ? "text-red-700" : "text-brand"}`}
          role={prep.late ? "alert" : undefined}
        >
          ⏱ {prep.text}
        </p>
      ) : null}

      {order.payment_status && order.payment_status !== "not_required" ? (
        <p className="mt-2">
          <PaymentBadge status={order.payment_status} />
        </p>
      ) : null}

      {order.customer_phone ? (
        <div className="mt-2">
          <CustomerPhone phone={order.customer_phone} compact />
        </div>
      ) : null}

      {withDelivery && fee ? (
        <div className="mt-2 rounded-lg bg-sky-50 px-2 py-1.5 text-[11px] text-sky-900">
          <p className="font-semibold">
            🛵 {order.delivery_zone_name ?? "Envío"} · {fee.price}
          </p>
          <p>{courierStatusLabel(order, courierName)}</p>
          {searching ? <p className="font-medium">{offersLabel(offers, now)}</p> : null}
          {searching && offers && offers.ofertas.length > 0 ? (
            <ul className="mt-0.5 space-y-0.5">
              {offers.ofertas.slice(0, 3).map((offer) => (
                <li key={offer.id} className="truncate">
                  {offer.favorito ? "⭐ " : ""}
                  {offer.repartidor} · {formatMoney(offer.precio)}
                </li>
              ))}
              {offers.ofertas.length > 3 ? <li>y {offers.ofertas.length - 3} más…</li> : null}
            </ul>
          ) : null}
          {fee.list ? (
            <p>
              Precio de lista {fee.list}
              {fee.reason ? ` · ${fee.reason}` : ""}
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
            <ItemNote note={item.note} />
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
            className="flex-1 rounded-lg bg-action px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-action-hover disabled:opacity-60"
          >
            {busy ? "Guardando…" : action.label}
          </button>
        ) : null}
        {warning ? (
          // Nadie lo tomó: asignarlo o llevarlo se hace desde el detalle.
          <button
            type="button"
            onClick={onOpen}
            className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
          >
            Resolver envío
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

      {inKitchen && onDelay && order.prep_ready_at ? (
        choosingReason ? (
          <div className="mt-2 rounded-lg bg-stone-50 p-2">
            <p className="text-[11px] font-medium text-stone-600">¿Por qué se demora? (opcional)</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {PREP_REASONS.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setChoosingReason(false);
                    onDelay(reason);
                  }}
                  className="rounded-lg border border-line-strong bg-white px-2 py-1 text-xs font-medium text-brand transition hover:bg-brand-soft disabled:opacity-60"
                >
                  {PREP_REASON_LABELS[reason]}
                </button>
              ))}
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setChoosingReason(false);
                  onDelay(null);
                }}
                className="rounded-lg border border-line-strong bg-white px-2 py-1 text-xs font-medium text-stone-600 transition hover:bg-brand-soft disabled:opacity-60"
              >
                Sin motivo
              </button>
              <button
                type="button"
                onClick={() => setChoosingReason(false)}
                className="px-2 py-1 text-xs text-stone-500"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => setChoosingReason(true)}
            className="mt-2 w-full rounded-lg border border-line-strong px-2.5 py-1.5 text-xs font-medium text-brand transition hover:bg-brand-soft disabled:opacity-60"
          >
            Demorar +10
          </button>
        )
      ) : null}

      {inKitchen && onSetPrep && !order.prep_ready_at ? (
        <button
          type="button"
          disabled={busy}
          onClick={onSetPrep}
          className="mt-2 w-full rounded-lg border border-line-strong px-2.5 py-1.5 text-xs font-medium text-brand transition hover:bg-brand-soft disabled:opacity-60"
        >
          Poner tiempo
        </button>
      ) : null}

      {blocked ? <p className="mt-1.5 text-[11px] text-stone-500">{blockReason}</p> : null}
    </article>
  );
}
