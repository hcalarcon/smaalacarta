"use client";

import { useState } from "react";

import {
  availableActions,
  chatLink,
  telLink,
  type CourierPanelOrder,
} from "@/lib/courier/panel";
import { canMarkSettled, courierOrderState, settlementLabel } from "@/lib/courier/settlements";
import {
  collectionInfo,
  validateCourierResponse,
  type CourierResponseInput,
} from "@/lib/orders/courier";
import { formatDateTime, timeAgo } from "@/lib/orders/format";
import { itemOptionLines } from "@/lib/orders/item-options";
import { preorderLabel, scheduledLabel } from "@/lib/orders/scheduled";
import { STATUS_LABELS, type OrderStatus } from "@/lib/orders/status";
import { formatMoney } from "@/lib/promotions/pricing";
import ConfirmDeleteDialog from "../../dashboard/components/ConfirmDeleteDialog";

type Errors = Partial<Record<"note" | "fee" | "reason", string>>;

const ENVIO_LABELS: Record<string, string> = {
  waiting: "Esperando tu respuesta",
  requested: "El local te consultó",
  accepted: "Aceptado",
  rejected: "No podés llevarlo",
};

// Un pedido con envío, con todo lo que el repartidor necesita para salir (ENVIO-31). Todo texto
// del local, del cliente o de los productos se escribe como texto, nunca como HTML.
export default function CourierOrderCard({
  order,
  now,
  busy,
  error,
  onRespond,
  onAdvance,
  onSettle,
}: {
  order: CourierPanelOrder;
  now: Date;
  busy: boolean;
  error: string | null;
  onRespond: (action: "accept" | "reject", input: CourierResponseInput) => void;
  onAdvance: (status: "on_the_way" | "delivered") => void;
  // Marca que ya rindió al local lo cobrado del pedido (ENVIO-42): no se deshace.
  onSettle: () => void;
}) {
  const [form, setForm] = useState<"accept" | "reject" | null>(null);
  const [note, setNote] = useState("");
  const [fee, setFee] = useState(() => String(order.envio.precio ?? ""));
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [settling, setSettling] = useState(false);

  const actions = availableActions(order);
  const collection = collectionInfo({ payment: order.pago, total: order.total, fee: order.envio.precio });
  const settlement = courierOrderState(order);
  const currentFee = Number(order.envio.precio ?? 0);
  const listFee = order.envio.precio_lista;
  const changed = listFee !== null && order.envio.precio !== null && Number(listFee) !== currentFee;

  const when = order.anticipado ? preorderLabel(order.programado) : scheduledLabel(order.programado);
  const localChat = chatLink(order.negocio.whatsapp);
  const clientChat = chatLink(order.cliente.telefono);
  const clientCall = telLink(order.cliente.telefono);

  // ¿El precio escrito es distinto del actual? Entonces el motivo es obligatorio.
  const typed = validateCourierResponse({ note: "", fee, reason: "-" }, currentFee);
  const feeChanged = form === "accept" && typed.ok && typed.fee !== null;

  function submit(action: "accept" | "reject") {
    const input: CourierResponseInput = {
      note,
      fee: action === "accept" ? fee : "",
      reason: action === "accept" ? reason : "",
    };

    const result = validateCourierResponse(input, currentFee);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }

    setErrors({});
    setForm(null);
    onRespond(action, input);
  }

  return (
    <article className="rounded-2xl border border-line bg-white p-4 shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-base font-semibold text-brand">
            #{order.numero} · {order.negocio.nombre}
          </p>
          <p className="text-xs text-stone-500">
            {formatDateTime(order.creado)} · {timeAgo(order.creado, now)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {when ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              🕒 {when}
            </span>
          ) : null}
          <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand">
            {STATUS_LABELS[order.estado as OrderStatus] ?? order.estado}
          </span>
        </div>
      </header>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Retirar en</h3>
          <p className="mt-1 text-sm font-medium text-stone-900">{order.negocio.nombre}</p>
          {order.negocio.direccion ? (
            <p className="text-sm text-stone-600">{order.negocio.direccion}</p>
          ) : null}
          {localChat ? (
            <a
              href={localChat}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block rounded-lg border border-line-strong px-2.5 py-1 text-xs font-medium text-brand transition hover:bg-brand-soft"
            >
              WhatsApp del local
            </a>
          ) : null}
        </section>

        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Entregar a</h3>
          <p className="mt-1 text-sm font-medium text-stone-900">{order.cliente.nombre || "Sin nombre"}</p>
          {order.cliente.direccion ? (
            <p className="text-sm text-stone-600">{order.cliente.direccion}</p>
          ) : null}
          {order.cliente.telefono ? (
            <p className="text-sm text-stone-600">{order.cliente.telefono}</p>
          ) : null}
          <div className="mt-1 flex flex-wrap gap-1.5">
            {clientCall ? (
              <a
                href={clientCall}
                className="rounded-lg border border-line-strong px-2.5 py-1 text-xs font-medium text-brand transition hover:bg-brand-soft"
              >
                Llamar
              </a>
            ) : null}
            {clientChat ? (
              <a
                href={clientChat}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-line-strong px-2.5 py-1 text-xs font-medium text-brand transition hover:bg-brand-soft"
              >
                WhatsApp del cliente
              </a>
            ) : null}
          </div>
        </section>
      </div>

      {order.envio.estado !== "rejected" && order.estado !== "cancelled" ? (
        <p
          className={`mt-3 rounded-xl px-3 py-2 text-sm font-semibold ${
            collection.cash ? "bg-amber-100 text-amber-900" : "bg-sky-50 text-sky-900"
          }`}
        >
          💵 {collection.text}
        </p>
      ) : null}

      <dl className="mt-3 space-y-1 rounded-xl bg-cream p-3 text-sm text-stone-700">
        <div className="flex gap-2">
          <dt className="text-stone-500">Barrio:</dt>
          <dd className="font-medium">{order.envio.zona ?? "-"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-stone-500">Precio del envío:</dt>
          <dd className="font-medium">{formatMoney(currentFee)}</dd>
        </div>
        {changed && listFee !== null ? (
          <div className="flex gap-2">
            <dt className="text-stone-500">Precio de lista:</dt>
            <dd>
              {formatMoney(Number(listFee))}
              {order.envio.motivo_cambio ? ` · Motivo del cambio: ${order.envio.motivo_cambio}` : ""}
            </dd>
          </div>
        ) : null}
        <div className="flex gap-2">
          <dt className="text-stone-500">Total del pedido (lo cobra el local):</dt>
          <dd className="font-medium">{formatMoney(Number(order.total))}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-stone-500">Pago:</dt>
          <dd>{order.pago || "-"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-stone-500">Envío:</dt>
          <dd>{ENVIO_LABELS[order.envio.estado ?? ""] ?? "-"}</dd>
        </div>
        {order.envio.nota ? (
          <div className="flex gap-2">
            <dt className="text-stone-500">Nota del envío:</dt>
            <dd>{order.envio.nota}</dd>
          </div>
        ) : null}
        {order.notas ? (
          <div className="flex gap-2">
            <dt className="text-stone-500">Notas del cliente:</dt>
            <dd className="whitespace-pre-wrap">{order.notas}</dd>
          </div>
        ) : null}
      </dl>

      {order.items.length > 0 ? (
        <ul className="mt-3 space-y-0.5 text-sm text-stone-700">
          {order.items.map((item, index) => (
            <li key={index}>
              <span className="block">
                {item.cantidad} × {item.nombre}
              </span>
              {itemOptionLines(item.opciones).map((line) => (
                <span key={line} className="block pl-4 text-xs text-stone-500">
                  {line}
                </span>
              ))}
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {actions.respond ? (
        form === null ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setForm("accept")}
              className="min-h-11 rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60"
            >
              Aceptar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setForm("reject")}
              className="min-h-11 rounded-xl border border-red-200 px-5 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
            >
              No puedo
            </button>
          </div>
        ) : (
          <div className="mt-3 space-y-3 rounded-xl border border-line p-3">
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
                className="rounded-xl border border-line-strong px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-brand-soft"
              >
                Volver
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => submit(form)}
                className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60"
              >
                {form === "accept" ? "Confirmar: acepto" : "Confirmar: no puedo"}
              </button>
            </div>
          </div>
        )
      ) : null}

      {settlement !== "none" ? (
        <div className="mt-3 rounded-xl border border-line p-3">
          <p className="text-sm font-semibold text-stone-800">
            💵 {settlementLabel(settlement, Number(order.total))}
          </p>
          {canMarkSettled(settlement) ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setSettling(true)}
              className="mt-2 min-h-11 rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60"
            >
              Rendido
            </button>
          ) : null}
        </div>
      ) : null}

      {actions.onTheWay || actions.delivered ? (
        <div className="mt-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => onAdvance(actions.onTheWay ? "on_the_way" : "delivered")}
            className="min-h-11 w-full rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60 sm:w-auto"
          >
            {busy ? "Guardando…" : actions.onTheWay ? "En camino" : "Entregado"}
          </button>
        </div>
      ) : null}

      {order.envio.estado === "accepted" && !actions.onTheWay && !actions.delivered && order.estado !== "delivered" && order.estado !== "cancelled" ? (
        <p className="mt-3 text-xs text-stone-500">
          Cuando el local te lo entregue vas a poder marcarlo En camino.
        </p>
      ) : null}
      <ConfirmDeleteDialog
        open={settling}
        title="Marcar como rendido"
        description={`¿Le rendiste a ${order.negocio.nombre} ${formatMoney(Number(order.total))} del pedido #${order.numero}? La marca no se puede deshacer.`}
        confirmLabel="Sí, rendido"
        loadingLabel="Guardando..."
        loading={busy}
        onConfirm={() => {
          setSettling(false);
          onSettle();
        }}
        onClose={() => setSettling(false)}
      />
    </article>
  );
}
