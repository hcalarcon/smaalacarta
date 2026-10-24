"use client";

import { useEffect, useRef, useState } from "react";

import type { Order } from "@/lib/db/orders";
import { timeAgo } from "@/lib/orders/format";
import CustomerPhone from "./CustomerPhone";
import DeliveryFeeEditor from "./DeliveryFeeEditor";
import PaymentBadge from "./PaymentBadge";
import SettlementStatus from "./SettlementStatus";
import { itemOptionLines } from "@/lib/orders/item-options";
import {
  courierStatusLabel,
  deliveryContext,
  feeSummary,
  isFeePending,
  hasDelivery,
  acceptsOffers,
  offersLabel,
  pickupEtaNotice,
  returnedNotice,
  searchWarning,
  type OrderCourier,
  type OrderOffers,
} from "@/lib/orders/courier";
import { isPaymentPending, PAYMENT_BLOCK_REASON } from "@/lib/orders/payment";
import {
  acceptsPrepTime,
  PREP_ADJUST_STEPS,
  PREP_REASON_LABELS,
  PREP_REASONS,
  prepBadge,
  type PrepReason,
} from "@/lib/orders/prep";
import { orderBadge } from "@/lib/orders/scheduled";
import { orderUrgency, STEPS, stepIndex } from "@/lib/orders/urgency";
import { isFinal, primaryAction, STATUS_LABELS, type OrderStatus } from "@/lib/orders/status";
import { formatMoney } from "@/lib/promotions/pricing";
import ItemNote from "@/components/ui/ItemNote";
import PendingButton from "@/components/ui/PendingButton";
import VehicleIcons from "@/components/ui/VehicleIcon";
import { NO_COURIERS_BADGE } from "@/lib/courier/availability";

const SHOWN_ITEMS = 2;

// El borde izquierdo dice la urgencia (ADMIN-PEDIDOS-54): neutro, ámbar o rojo.
const URGENCY_BORDER = ["border-l-line", "border-l-amber-500", "border-l-red-500"] as const;

export default function OrderCard({
  order,
  now,
  busy,
  onAdvance,
  onOpen,
  onConfirmSettlement,
  couriers = [],
  offers,
  assignMinutes,
  onSetPrep,
  onAdjust,
  onSetFee,
  vehicleEnabled = false,
  noCouriers = false,
}: {
  // El interruptor del vehículo (ENVIO-175): apagado, no se ven ni "Necesita auto" ni los íconos.
  vehicleEnabled?: boolean;
  // La zona del pedido no tiene repartidores disponibles ahora (ENVIO-200).
  noCouriers?: boolean;
  order: Order;
  now: Date;
  busy: boolean;
  // Puede devolver una promesa: el botón espera lo que tarde y no deja tocar de nuevo (ADMIN-PEDIDOS-51).
  onAdvance: (status: string) => void | Promise<void | boolean>;
  onOpen: () => void;
  onConfirmSettlement?: () => void;
  // Los repartidores del local: sirven para nombrar al que tomó el pedido y al favorito.
  couriers?: OrderCourier[];
  // Las ofertas abiertas del pedido si está buscando repartidor (ENVIO-117).
  offers?: OrderOffers;
  // A los cuántos minutos sin ofertas se destaca "Nadie ofertó todavía" (ENVIO-241): el de la plataforma.
  assignMinutes?: number;
  // Tiempo estimado (ADMIN-PEDIDOS-34, 35 y 52): cargarlo en un pedido aceptado sin tiempo, o subirlo o
  // bajarlo `delta` minutos con un motivo opcional (nulo = sin motivo).
  onSetPrep?: () => void;
  onAdjust?: (delta: number, reason: string | null) => void | Promise<void>;
  // Cargar el costo de un envío a coordinar con el cliente (ENVIO-262). Devuelve un mensaje si falló.
  onSetFee?: (fee: string) => Promise<string | void>;
}) {
  const [adjusting, setAdjusting] = useState(false);
  const [reason, setReason] = useState<PrepReason | null>(null);

  // Al abrir el panel el foco entra en él: el teclado sigue ahí y Escape lo cierra.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (adjusting) panelRef.current?.focus();
  }, [adjusting]);

  function closeAdjust() {
    setAdjusting(false);
    setReason(null);
  }
  const withDelivery = hasDelivery(order);
  const action = primaryAction(order.status, deliveryContext(order));
  const extra = order.order_items.length - SHOWN_ITEMS;
  const scheduled = orderBadge(order);
  const paymentBlocked = isPaymentPending(order.payment_status);
  const blocked = paymentBlocked;
  const blockReason = paymentBlocked ? PAYMENT_BLOCK_REASON : undefined;
  const fee = withDelivery ? feeSummary(order) : null;
  const searching = withDelivery && order.courier_status === "searching" && !isFinal(order.status);
  const warning = withDelivery ? searchWarning(order, now, offers?.ofertas.length ?? 0, assignMinutes) : null;
  // El tiempo solo cuenta en un pedido aceptado y en preparación, sin hora propia.
  const inKitchen =
    (order.status === "confirmed" || order.status === "preparing") && acceptsPrepTime(order);
  const prep = prepBadge(order, now);
  const urgency = orderUrgency(order, now, offers?.ofertas.length ?? 0, assignMinutes);
  const step = stepIndex(order.status);
  const adjustable = Boolean(inKitchen && onAdjust && order.prep_ready_at);
  const taker = order.courier_id ? couriers.find((courier) => courier.id === order.courier_id) : undefined;
  const courierName = taker?.name;
  const needsCar = vehicleEnabled && order.needs_car === true && withDelivery && !isFinal(order.status);

  return (
    // Tocar la tarjeta abre el detalle; los botones y enlaces de adentro hacen lo suyo y no lo abren.
    <article
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a, button, input, select, textarea")) return;
        onOpen();
      }}
      className={`cursor-pointer rounded-xl border border-l-4 p-3 shadow-sm ${URGENCY_BORDER[urgency]} ${
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

      {step >= 0 ? (
        // La cinta del circuito (ADMIN-PEDIDOS-53): siempre del mismo alto; el texto del paso va abajo.
        <div data-steps aria-hidden="true" title={STEPS[step]} className="mt-2 flex gap-1">
          {STEPS.map((name, index) => (
            <span
              key={name}
              data-done={index <= step ? "" : undefined}
              className={`h-1.5 flex-1 rounded-full ${index <= step ? "bg-action" : "bg-line"}`}
            />
          ))}
        </div>
      ) : null}

      {scheduled || (order.payment_status && order.payment_status !== "not_required") ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {scheduled ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              🕒 {scheduled}
            </span>
          ) : null}
          {order.payment_status && order.payment_status !== "not_required" ? (
            <PaymentBadge status={order.payment_status} />
          ) : null}
        </div>
      ) : null}

      {prep ? (
        // El reloj de la demora: en un pedido ajustable es el botón que abre el panel (ADMIN-PEDIDOS-55).
        <div className="relative mt-2">
          {adjustable ? (
            <button
              type="button"
              aria-label="Cambiar demora"
              aria-haspopup="dialog"
              aria-expanded={adjusting}
              disabled={busy}
              onClick={() => (adjusting ? closeAdjust() : setAdjusting(true))}
              className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border px-2.5 text-left text-sm font-semibold transition disabled:opacity-60 ${
                prep.late
                  ? "border-red-300 text-red-700 hover:bg-red-100"
                  : "border-line-strong text-brand hover:bg-brand-soft"
              }`}
            >
              <span className={prep.late ? "text-red-700" : "text-brand"}>⏱ {prep.text}</span>
              <span aria-hidden="true" className="shrink-0 text-xs font-medium text-stone-500">
                Cambiar ▾
              </span>
            </button>
          ) : (
            <p
              className={`text-sm font-semibold ${prep.late ? "text-red-700" : "text-brand"}`}
              role={prep.late ? "alert" : undefined}
            >
              ⏱ {prep.text}
            </p>
          )}

          {adjusting && adjustable && onAdjust ? (
            <>
              <button
                type="button"
                aria-hidden="true"
                tabIndex={-1}
                onClick={closeAdjust}
                className="fixed inset-0 z-10 cursor-default"
              />
              <div
                ref={panelRef}
                tabIndex={-1}
                role="dialog"
                aria-label="Cambiar la demora"
                onKeyDown={(event) => {
                  if (event.key === "Escape") closeAdjust();
                }}
                className="absolute inset-x-0 top-full z-20 mt-1 rounded-xl border border-line-strong bg-white p-2.5 shadow-lg outline-none"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-stone-600">Cambiar la demora</p>
                  <button
                    type="button"
                    onClick={closeAdjust}
                    aria-label="Cerrar"
                    className="-mr-2 -my-2 grid size-11 place-items-center rounded-lg text-stone-500 hover:bg-brand-soft"
                  >
                    ✕
                  </button>
                </div>

                <div className="mt-1 flex flex-wrap gap-1.5">
                  {PREP_ADJUST_STEPS.map((delta) => (
                    <PendingButton
                      key={delta}
                      busy={busy}
                      pendingLabel="Guardando…"
                      onClick={async () => {
                        await onAdjust(delta, reason);
                        closeAdjust();
                      }}
                      className="min-h-11 min-w-14 rounded-lg border border-line-strong bg-white px-2 py-1 text-xs font-semibold text-brand transition hover:bg-brand-soft disabled:opacity-60"
                    >
                      {delta < 0 ? `−${-delta}` : `+${delta}`} min
                    </PendingButton>
                  ))}
                  {onSetPrep ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        closeAdjust();
                        onSetPrep();
                      }}
                      className="min-h-11 rounded-lg border border-line-strong bg-white px-2 py-1 text-xs font-medium text-brand transition hover:bg-brand-soft disabled:opacity-60"
                    >
                      Otro valor…
                    </button>
                  ) : null}
                </div>

                <p className="mt-2 text-[11px] font-medium text-stone-600">Motivo (opcional)</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {PREP_REASONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={reason === option}
                      disabled={busy}
                      onClick={() => setReason(reason === option ? null : option)}
                      className={`min-h-9 rounded-lg border px-2 py-1 text-xs font-medium transition disabled:opacity-60 ${
                        reason === option
                          ? "border-brand bg-brand text-white"
                          : "border-line-strong bg-white text-brand hover:bg-brand-soft"
                      }`}
                    >
                      {PREP_REASON_LABELS[option]}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {order.customer_phone ? (
        <div className="mt-2">
          <CustomerPhone phone={order.customer_phone} compact />
        </div>
      ) : null}

      {withDelivery && fee ? (
        <div className="mt-2 rounded-lg bg-sky-50 px-2 py-1.5 text-[11px] text-sky-900">
          <p className="font-semibold">
            🛵 {order.delivery_zone_name ?? "Envío"} · {fee.pending ? "costo a confirmar" : fee.price}
          </p>
          <p>
            {courierStatusLabel(order, courierName)}
            {vehicleEnabled ? <VehicleIcons vehicles={taker?.vehiculo} className="ml-1" /> : null}
          </p>
          {needsCar ? (
            <p className="mt-0.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 font-semibold text-sky-900">
                <VehicleIcons vehicles={["auto"]} />
                Necesita auto
              </span>
            </p>
          ) : null}
          {noCouriers ? (
            <p className="mt-0.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">
                {NO_COURIERS_BADGE}
              </span>
            </p>
          ) : null}
          {returnedNotice(order) ? <p className="font-semibold text-amber-800">{returnedNotice(order)}</p> : null}
          {pickupEtaNotice(order) ? <p className="font-medium">⏱ {pickupEtaNotice(order)}</p> : null}
          {searching && acceptsOffers(order) ? <p className="font-medium">{offersLabel(offers, now)}</p> : null}
          {searching && acceptsOffers(order) && offers && offers.ofertas.length > 0 ? (
            <ul className="mt-0.5 space-y-0.5">
              {offers.ofertas.slice(0, 3).map((offer) => (
                <li key={offer.id} className="truncate">
                  {offer.favorito ? "⭐ " : ""}
                  {offer.repartidor}
                  {vehicleEnabled ? <VehicleIcons vehicles={offer.vehiculo} className="mx-1" /> : null} ·{" "}
                  {formatMoney(offer.precio)}
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
          {order.delivery_fee_coordinated && onSetFee && !isFinal(order.status) ? (
            <DeliveryFeeEditor
              compact
              pending={isFeePending(order)}
              current={fee.price}
              busy={busy}
              onSave={onSetFee}
            />
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

      <div className="mt-2 flex flex-wrap gap-1.5">
        {action ? (
          <PendingButton
            onClick={() => onAdvance(action.status)}
            pending={busy}
            settleKey={order.status}
            pendingLabel={action.status === "confirmed" ? "Aceptando…" : "Guardando…"}
            disabled={blocked}
            title={blocked ? blockReason : undefined}
            className="min-h-11 flex-1 rounded-lg bg-action px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-action-hover disabled:opacity-60"
          >
            {action.label}
          </PendingButton>
        ) : null}
        {warning ? (
          // Nadie lo tomó: asignarlo o llevarlo se hace desde el detalle.
          <button
            type="button"
            onClick={onOpen}
            className="min-h-11 rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
          >
            Resolver envío
          </button>
        ) : null}
        <button
          type="button"
          onClick={onOpen}
          aria-label="Detalle"
          title="Detalle"
          className="min-h-11 min-w-11 rounded-lg border border-line-strong px-2.5 py-1.5 text-base font-semibold leading-none text-brand transition hover:bg-brand-soft"
        >
          ⋯
        </button>
      </div>

      {inKitchen && onSetPrep && !order.prep_ready_at ? (
        <button
          type="button"
          disabled={busy}
          onClick={onSetPrep}
          className="mt-2 min-h-11 w-full rounded-lg border border-line-strong px-2.5 py-1.5 text-xs font-medium text-brand transition hover:bg-brand-soft disabled:opacity-60"
        >
          Poner tiempo
        </button>
      ) : null}

      {blocked ? <p className="mt-1.5 text-[11px] text-stone-500">{blockReason}</p> : null}
    </article>
  );
}
