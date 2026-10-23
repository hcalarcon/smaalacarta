"use client";

import { useState } from "react";

import VehicleIcons from "@/components/ui/VehicleIcon";
import { chatLink } from "@/lib/courier/panel";
import type { Order } from "@/lib/db/orders";
import {
  courierActions,
  courierStatusLabel,
  couriersForOrder,
  feeSummary,
  acceptsOffers,
  offersLabel,
  pickupEtaNotice,
  returnedNotice,
  searchWarning,
  validateAssignNote,
  type OrderCourier,
  type OrderOffers,
} from "@/lib/orders/courier";
import { formatDateTime } from "@/lib/orders/format";
import { formatMoney } from "@/lib/promotions/pricing";
import { isFinal, STATUS_LABELS, type OrderStatus } from "@/lib/orders/status";

// El envío con repartidor dentro del detalle del pedido (ENVIO-80 a 82): cómo va la búsqueda, quién lo
// tomó, el precio y lo que el local puede hacer si nadie lo toma — asignarlo a mano o llevarlo él.
// Todo texto del cliente o del repartidor se escribe como texto, nunca como HTML.
export default function CourierSection({
  order,
  now,
  couriers,
  offers,
  assignMinutes,
  busy,
  error,
  onAssign,
  onSelf,
  vehicleEnabled = false,
  onNeedsCar,
}: {
  // El interruptor del vehículo (ENVIO-175) y cómo prender o apagar "Necesita auto" (ENVIO-176).
  vehicleEnabled?: boolean;
  onNeedsCar?: (needsCar: boolean) => void;
  order: Order;
  now: Date;
  // Los repartidores activos que cubren alguna zona del local (`business_delivery_options()`).
  couriers: OrderCourier[];
  // Las ofertas abiertas del pedido, con nombre y precio (ENVIO-117).
  offers?: OrderOffers;
  // A los cuántos minutos sin ofertas se destaca "Nadie ofertó todavía" (ENVIO-241): el de la plataforma.
  assignMinutes?: number;
  busy: boolean;
  error: string | null;
  onAssign: (courierId: string, note: string) => void;
  onSelf: () => void;
}) {
  const [choosing, setChoosing] = useState(false);
  const [courierId, setCourierId] = useState("");
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [confirmSelf, setConfirmSelf] = useState(false);

  const actions = courierActions(order);
  const summary = feeSummary(order);
  const searching = order.courier_status === "searching" && !isFinal(order.status);
  const warning = searchWarning(order, now, offers?.ofertas.length ?? 0, assignMinutes);
  const candidates = couriersForOrder(couriers, order);
  // Se pide o se saca el auto mientras nadie tenga el pedido (ENVIO-176).
  const canToggleCar =
    vehicleEnabled &&
    Boolean(onNeedsCar) &&
    !order.courier_id &&
    (order.courier_status === "waiting" || order.courier_status === "searching") &&
    !isFinal(order.status);

  const taker = order.courier_id ? couriers.find((courier) => courier.id === order.courier_id) : undefined;
  const takerChat = chatLink(
    taker?.whatsapp,
    `Hola, te escribo por el pedido #${order.order_number}.`,
  );
  const handedOver = order.status === "handed_to_courier" || order.status === "on_the_way";

  function submitAssign() {
    if (!courierId) {
      setNoteError("Elegí un repartidor.");
      return;
    }

    const result = validateAssignNote(note);
    if (!result.ok) {
      setNoteError(result.error);
      return;
    }

    setNoteError(null);
    setChoosing(false);
    onAssign(courierId, note);
  }

  return (
    <section className="mt-6 rounded-2xl border border-sky-200 bg-sky-50 p-4" aria-label="Envío con repartidor">
      <h3 className="text-sm font-semibold text-brand">🛵 Envío con repartidor</h3>

      <dl className="mt-2 space-y-1 text-sm text-stone-700">
        <div className="flex gap-2">
          <dt className="text-stone-400">Barrio:</dt>
          <dd>{order.delivery_zone_name ?? "-"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-stone-400">Dirección:</dt>
          <dd className="whitespace-pre-wrap">{order.delivery_address ?? "-"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-stone-400">Estado:</dt>
          <dd className="font-medium">
            {courierStatusLabel(order, taker?.name)}
            {vehicleEnabled ? <VehicleIcons vehicles={taker?.vehiculo} className="ml-1.5" /> : null}
            {returnedNotice(order) ? <span className="block font-semibold text-amber-800">{returnedNotice(order)}</span> : null}
            {pickupEtaNotice(order) ? <span className="block">⏱ {pickupEtaNotice(order)}</span> : null}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-stone-400">Precio del envío:</dt>
          <dd className="font-medium">{summary.price}</dd>
        </div>
        {summary.list ? (
          <div className="flex gap-2">
            <dt className="text-stone-400">Precio de lista:</dt>
            <dd>
              {summary.list}
              {summary.reason ? ` · Motivo del cambio: ${summary.reason}` : ""}
            </dd>
          </div>
        ) : null}
        {order.courier_note ? (
          <div className="flex gap-2">
            <dt className="text-stone-400">Nota:</dt>
            <dd>{order.courier_note}</dd>
          </div>
        ) : null}
        {order.offered_at ? (
          <div className="flex gap-2">
            <dt className="text-stone-400">Búsqueda abierta:</dt>
            <dd>{formatDateTime(order.offered_at)}</dd>
          </div>
        ) : null}
        {order.courier_responded_at && order.courier_status === "accepted" ? (
          <div className="flex gap-2">
            <dt className="text-stone-400">Lo tomó:</dt>
            <dd>{formatDateTime(order.courier_responded_at)}</dd>
          </div>
        ) : null}
      </dl>

      {canToggleCar ? (
        <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-3 rounded-xl bg-white px-3 py-2">
          <input
            type="checkbox"
            checked={order.needs_car === true}
            disabled={busy}
            onChange={(event) => onNeedsCar?.(event.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 accent-brand"
          />
          <span>
            <span className="block text-sm font-medium text-stone-800">Necesita auto</span>
            <span className="block text-xs text-stone-500">
              Pedido grande o una torta: solo lo ven los repartidores que tienen auto. Se puede cambiar hasta que
              alguien lo lleve.
            </span>
          </span>
        </label>
      ) : vehicleEnabled && order.needs_car ? (
        <p className="mt-3 inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-sky-900">
          <VehicleIcons vehicles={["auto"]} />
          Necesita auto
        </p>
      ) : null}

      {searching && acceptsOffers(order) ? (
        <div className="mt-3">
          <p className="text-sm font-medium text-sky-900">{offersLabel(offers, now)}</p>
          {offers && offers.ofertas.length > 0 ? (
            <ul className="mt-2 space-y-1 text-sm text-stone-700">
              {offers.ofertas.map((offer) => (
                <li key={offer.id} className="rounded-lg bg-white px-3 py-2">
                  <span className="font-medium">
                    {offer.favorito ? "⭐ " : ""}
                    {offer.repartidor}
                  </span>
                  {vehicleEnabled ? <VehicleIcons vehicles={offer.vehiculo} className="mx-1" /> : null} ·{" "}
                  {formatMoney(offer.precio)}
                  {offer.favorito ? <span className="text-xs text-stone-500"> · tu favorito</span> : null}
                  {offer.motivo ? <span className="block text-xs text-stone-500">{offer.motivo}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {warning ? (
        <p role="alert" className="mt-3 rounded-xl bg-red-100 px-3 py-2 text-sm font-semibold text-red-800">
          {warning}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {order.courier_status === "accepted" && takerChat ? (
        <a
          href={takerChat}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block rounded-xl border border-line-strong bg-white px-4 py-2 text-sm font-medium text-brand transition hover:bg-brand-soft"
        >
          WhatsApp a {taker?.name ?? "el repartidor"}
        </a>
      ) : null}

      {handedOver ? (
        <p className="mt-3 text-sm text-stone-600">
          {STATUS_LABELS[order.status as OrderStatus]}: desde acá lo lleva el repartidor, que lo pasa a En camino
          y Entregado.
        </p>
      ) : null}

      {actions.assign || actions.self ? (
        <div className="mt-4 space-y-3">
          {choosing ? (
            <div className="space-y-3 rounded-xl border border-line bg-white p-3">
              <label className="block text-sm text-stone-700">
                Repartidor
                <select
                  value={courierId}
                  onChange={(event) => setCourierId(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-line-strong bg-white px-3 py-2 text-sm"
                >
                  <option value="">Elegí un repartidor</option>
                  {candidates.map((courier) => (
                    <option key={courier.id} value={courier.id}>
                      {courier.name}
                    </option>
                  ))}
                </select>
              </label>
              {candidates.length === 0 ? (
                <p className="text-xs text-stone-500">Ningún repartidor activo cubre este barrio por ahora.</p>
              ) : null}

              <label className="block text-sm text-stone-700">
                Nota (opcional)
                <input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  maxLength={120}
                  placeholder="Hablamos por WhatsApp, pasa a las 21:30"
                  className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2 text-sm"
                />
              </label>
              {noteError ? <p className="text-xs text-red-700">{noteError}</p> : null}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChoosing(false);
                    setNoteError(null);
                  }}
                  className="rounded-xl border border-line-strong bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-brand-soft"
                >
                  Volver
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={submitAssign}
                  className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60"
                >
                  Asignar
                </button>
              </div>
            </div>
          ) : confirmSelf ? (
            <div className="space-y-3 rounded-xl border border-line bg-white p-3">
              <p className="text-sm text-stone-700">
                ¿Lo llevás vos? El pedido deja de buscarse entre los repartidores y lo marcás entregado desde acá.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmSelf(false)}
                  className="rounded-xl border border-line-strong bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-brand-soft"
                >
                  Volver
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setConfirmSelf(false);
                    onSelf();
                  }}
                  className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60"
                >
                  Sí, lo llevo yo
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {actions.assign ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setChoosing(true)}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-60 ${
                    warning
                      ? "bg-brand text-white hover:bg-brand-hover"
                      : "border border-line-strong bg-white text-brand hover:bg-brand-soft"
                  }`}
                >
                  Asignar a mano
                </button>
              ) : null}
              {actions.self ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmSelf(true)}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-60 ${
                    warning
                      ? "bg-brand text-white hover:bg-brand-hover"
                      : "border border-line-strong bg-white text-brand hover:bg-brand-soft"
                  }`}
                >
                  Lo llevo yo
                </button>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {order.delivery_events.length > 0 ? (
        <div className="mt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Historial del envío</h4>
          <ul className="mt-1 space-y-0.5 text-xs text-stone-600">
            {order.delivery_events.map((event, index) => (
              <li key={index} className="flex justify-between gap-3">
                <span>{event.note}</span>
                <span className="shrink-0 text-stone-400">{formatDateTime(event.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
