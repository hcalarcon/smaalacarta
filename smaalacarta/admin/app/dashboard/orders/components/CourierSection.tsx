"use client";

import { useState } from "react";

import type { ActiveCourier, Order } from "@/lib/db/orders";
import {
  courierActions,
  courierRequestMessage,
  courierStatusLabel,
  courierWhatsappLink,
  feeSummary,
  noResponseWarning,
  readyTimeDefault,
  validateCourierResponse,
  type CourierResponseInput,
} from "@/lib/orders/courier";
import { formatDateTime } from "@/lib/orders/format";
import { TIME_PATTERN } from "@/lib/orders/scheduled";
import { STATUS_LABELS, type OrderStatus } from "@/lib/orders/status";

type Action = "request" | "accept" | "reject";
type Errors = Partial<Record<"note" | "fee" | "reason", string>>;

const EMPTY: CourierResponseInput = { note: "", fee: "", reason: "" };

// El envío con Repartos al Toque dentro del detalle del pedido (ENVIO-24 a 26): estado, precio,
// y lo que el local puede hacer — pedirlo por WhatsApp o registrar lo que el repartidor contestó.
// Todo texto del cliente o del repartidor se escribe como texto, nunca como HTML.
export default function CourierSection({
  order,
  now,
  businessName,
  courier,
  trackingLink,
  busy,
  error,
  onAction,
}: {
  order: Order;
  now: Date;
  businessName: string;
  courier: ActiveCourier | null;
  trackingLink: string;
  busy: boolean;
  error: string | null;
  onAction: (action: Action, input: CourierResponseInput) => void;
}) {
  const [form, setForm] = useState<"accept" | "reject" | null>(null);
  const [note, setNote] = useState("");
  const [fee, setFee] = useState(() => String(order.delivery_fee ?? ""));
  const [reason, setReason] = useState("");
  const [readyAt, setReadyAt] = useState(() => readyTimeDefault(order, now));
  const [errors, setErrors] = useState<Errors>({});

  const actions = courierActions(order);
  const summary = feeSummary(order);
  const warning = noResponseWarning(order, now);
  const handedOver = order.status === "handed_to_courier" || order.status === "on_the_way";

  const requestLink = courierWhatsappLink(
    courier?.whatsapp,
    courierRequestMessage({
      businessName,
      order,
      readyAt: TIME_PATTERN.test(readyAt) ? readyAt : readyTimeDefault(order, now),
      trackingLink,
    }),
  );

  function request() {
    // La ventana se abre en el mismo toque: después de un await el navegador la bloquearía.
    if (requestLink) window.open(requestLink, "_blank", "noopener,noreferrer");
    onAction("request", EMPTY);
  }

  function submit(action: "accept" | "reject") {
    const input: CourierResponseInput = {
      note,
      fee: action === "accept" ? fee : "",
      reason: action === "accept" ? reason : "",
    };

    const result = validateCourierResponse(input, Number(order.delivery_fee ?? 0));
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }

    setErrors({});
    setForm(null);
    onAction(action, input);
  }

  // ¿El precio escrito es distinto del actual? Entonces el motivo es obligatorio.
  const typed = validateCourierResponse({ note: "", fee, reason: "-" }, Number(order.delivery_fee ?? 0));
  const feeChanged = form === "accept" && typed.ok && typed.fee !== null;

  return (
    <section className="mt-6 rounded-2xl border border-sky-200 bg-sky-50 p-4" aria-label="Envío con repartidor">
      <h3 className="text-sm font-semibold text-brand">🛵 Envío con Repartos al Toque</h3>

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
          <dt className="text-stone-400">Teléfono:</dt>
          <dd>{order.customer_phone ?? "-"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-stone-400">Estado:</dt>
          <dd className="font-medium">{courierStatusLabel(order)}</dd>
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
            <dt className="text-stone-400">Nota del repartidor:</dt>
            <dd>{order.courier_note}</dd>
          </div>
        ) : null}
        {order.courier_requested_at ? (
          <div className="flex gap-2">
            <dt className="text-stone-400">Consultado:</dt>
            <dd>{formatDateTime(order.courier_requested_at)}</dd>
          </div>
        ) : null}
        {order.courier_responded_at ? (
          <div className="flex gap-2">
            <dt className="text-stone-400">Respondió:</dt>
            <dd>{formatDateTime(order.courier_responded_at)}</dd>
          </div>
        ) : null}
      </dl>

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

      {handedOver ? (
        <p className="mt-3 text-sm text-stone-600">
          {STATUS_LABELS[order.status as OrderStatus]}: desde acá lo lleva el repartidor, que lo pasa a En camino
          y Entregado.
        </p>
      ) : null}

      {actions.request || actions.accept || actions.reject ? (
        <div className="mt-4 space-y-3">
          {actions.request ? (
            <div className="space-y-2">
              <label className="flex flex-wrap items-center gap-2 text-sm text-stone-700">
                Listo a las
                <input
                  type="time"
                  value={readyAt}
                  onChange={(event) => setReadyAt(event.target.value)}
                  className="rounded-lg border border-line-strong bg-white px-2 py-1 text-sm"
                />
              </label>
              <button
                type="button"
                disabled={busy || !requestLink}
                onClick={request}
                className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60"
              >
                {actions.request}
              </button>
              {!requestLink ? (
                <p className="text-xs text-stone-500">
                  Todavía no hay un WhatsApp cargado para el repartidor: pedile el envío por otro medio y
                  registrá abajo lo que contestó.
                </p>
              ) : (
                <p className="text-xs text-stone-500">Abre WhatsApp con el pedido armado para Repartos al Toque.</p>
              )}
            </div>
          ) : null}

          {form === null ? (
            <div className="flex flex-wrap gap-2">
              {actions.accept ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setForm("accept")}
                  className="rounded-xl border border-line-strong bg-white px-4 py-2 text-sm font-medium text-brand transition hover:bg-brand-soft disabled:opacity-60"
                >
                  Repartidor aceptó
                </button>
              ) : null}
              {actions.reject ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setForm("reject")}
                  className="rounded-xl px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                >
                  No puede
                </button>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3 rounded-xl border border-line bg-white p-3">
              <label className="block text-sm text-stone-700">
                Nota (opcional)
                <input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  maxLength={120}
                  placeholder={form === "accept" ? "Juan, 21:30" : "Sin repartidores por ahora"}
                  className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2 text-sm"
                />
                {errors.note ? <span className="text-xs text-red-700">{errors.note}</span> : null}
              </label>

              {form === "accept" ? (
                <>
                  <label className="block text-sm text-stone-700">
                    Precio final del envío
                    <input
                      value={fee}
                      onChange={(event) => setFee(event.target.value)}
                      inputMode="decimal"
                      className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2 text-sm"
                    />
                    {errors.fee ? <span className="text-xs text-red-700">{errors.fee}</span> : null}
                  </label>

                  {feeChanged || errors.reason ? (
                    <label className="block text-sm text-stone-700">
                      Motivo del cambio de precio
                      <input
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        maxLength={200}
                        placeholder="Fuera de zona"
                        className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2 text-sm"
                      />
                      {errors.reason ? <span className="text-xs text-red-700">{errors.reason}</span> : null}
                    </label>
                  ) : null}
                </>
              ) : null}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setForm(null);
                    setErrors({});
                  }}
                  className="rounded-xl border border-line-strong bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-brand-soft"
                >
                  Volver
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => submit(form)}
                  className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60"
                >
                  {form === "accept" ? "Guardar: aceptó" : "Guardar: no puede"}
                </button>
              </div>
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
