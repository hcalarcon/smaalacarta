"use client";

import { paymentLabel } from "@/lib/orders/labels";
import { useState } from "react";

import {
  availableActions,
  chatLink,
  telLink,
  returnKindOptions,
  validateReturn,
  type ReturnKind,
  type CourierPanelOrder,
} from "@/lib/courier/panel";
import { canMarkSettled, courierOrderState, settlementLabel } from "@/lib/courier/settlements";
import { etaLabel, readyChange, readyLine, type EtaKind } from "@/lib/courier/times";
import { collectionInfo } from "@/lib/orders/courier";
import { formatDateTime, timeAgo } from "@/lib/orders/format";
import { itemOptionLines } from "@/lib/orders/item-options";
import { preorderLabel, scheduledLabel } from "@/lib/orders/scheduled";
import { STATUS_LABELS, type OrderStatus } from "@/lib/orders/status";
import { formatMoney } from "@/lib/promotions/pricing";
import PendingButton from "@/components/ui/PendingButton";
import ConfirmDeleteDialog from "../../dashboard/components/ConfirmDeleteDialog";
import ItemNote from "@/components/ui/ItemNote";
import EtaPicker from "./EtaPicker";

// Antes de este estado el local todavía no le entregó el pedido al repartidor.
const RETURNABLE_STATES = ["pending", "confirmed", "preparing", "ready"];

const ENVIO_LABELS: Record<string, string> = {
  accepted: "Lo tomaste",
  self: "Lo lleva el local",
};

// Un pedido con envío que el repartidor ya tomó, con todo lo que necesita para salir (ENVIO-31).
// Todo texto del local, del cliente o de los productos se escribe como texto, nunca como HTML.
export default function CourierOrderCard({
  order,
  now,
  busy,
  error,
  onReturn,
  onAdvance,
  onSetEta,
  onSettle,
}: {
  order: CourierPanelOrder;
  now: Date;
  busy: boolean;
  error: string | null;
  // Devuelve el pedido, con motivo (ENVIO-66): vuelve a buscarse entre los demás repartidores.
  // Pueden devolver una promesa: el botón espera lo que tarde y no deja tocar de nuevo (ENVIO-144).
  onReturn: (kind: ReturnKind, reason: string | null) => void | Promise<void>;
  // Al marcar En camino puede llevar los minutos que tarda en llegar al cliente (ENVIO-163).
  onAdvance: (status: "on_the_way" | "delivered", etaMinutes?: number) => void | Promise<void>;
  // "Llego al local en X" / "Llego al cliente en X" (ENVIO-157).
  onSetEta?: (kind: EtaKind, minutes: number) => void | Promise<void>;
  // Marca que ya rindió al local lo cobrado del pedido (ENVIO-42): no se deshace.
  onSettle: () => void | Promise<void>;
}) {
  const [returning, setReturning] = useState(false);
  const [returnKind, setReturnKind] = useState<ReturnKind | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [settling, setSettling] = useState(false);
  const [changingPickup, setChangingPickup] = useState(false);
  const [changingDropoff, setChangingDropoff] = useState(false);

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

  // La hora de listo (con la anterior tachada si el local la cambió) solo importa hasta retirar el pedido.
  const times = order.tiempos;
  const beforePickup = RETURNABLE_STATES.includes(order.estado) && order.envio.estado === "accepted";
  const change = beforePickup ? readyChange(times) : null;
  const ready = beforePickup ? readyLine(times?.listo_a, times?.demora_min) : null;
  const pickupEta = etaLabel("pickup", times?.llega_local_a);
  const dropoffEta = etaLabel("dropoff", times?.llega_cliente_a);

  function setEta(kind: EtaKind, minutes: number) {
    return Promise.resolve(onSetEta?.(kind, minutes)).finally(() => {
      setChangingPickup(false);
      setChangingDropoff(false);
    });
  }

  function submitReturn() {
    const result = validateReturn(returnKind ?? "", reason);
    if (!result.ok) {
      setReasonError(result.error);
      return;
    }

    setReasonError(null);
    return Promise.resolve(onReturn(result.kind, result.reason)).finally(() => {
      setReturning(false);
      setReturnKind(null);
      setReason("");
    });
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

      {ready ? (
        <p className="mt-3 rounded-xl bg-brand-soft px-3 py-2 text-sm font-semibold text-brand">
          ⏱{" "}
          {change ? (
            <>
              Listo para retirar a las <s className="text-stone-500">{change.before}</s> {change.now}
              {times?.demora_min != null ? ` · Demora ${times.demora_min} min` : ""}{" "}
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">Cambió</span>
            </>
          ) : (
            ready
          )}
        </p>
      ) : null}

      {beforePickup && onSetEta ? (
        pickupEta && !changingPickup ? (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm font-medium text-stone-800">
            {pickupEta}
            <button
              type="button"
              disabled={busy}
              onClick={() => setChangingPickup(true)}
              className="rounded-lg border border-line-strong px-2.5 py-1 text-xs font-medium text-brand transition hover:bg-brand-soft disabled:opacity-60"
            >
              Cambiar
            </button>
          </p>
        ) : (
          <EtaPicker title="Llego al local en…" busy={busy} onPick={(minutes) => setEta("pickup", minutes)} />
        )
      ) : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Retirar en</h3>
          <p className="mt-1 text-sm font-medium text-stone-900">{order.negocio.nombre}</p>
          {order.negocio.direccion ? (
            <p className="break-words text-sm text-stone-600">{order.negocio.direccion}</p>
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
            <p className="break-words text-sm text-stone-600">{order.cliente.direccion}</p>
          ) : null}
          {order.cliente.telefono ? (
            <p className="break-words text-sm text-stone-600">{order.cliente.telefono}</p>
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

      {order.estado !== "cancelled" ? (
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
          <dd>{paymentLabel(order.pago) || "-"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-stone-500">Envío:</dt>
          <dd>{ENVIO_LABELS[order.envio.estado ?? ""] ?? "-"}</dd>
        </div>
        {order.envio.nota ? (
          <div className="flex gap-2">
            <dt className="text-stone-500">Nota del envío:</dt>
            <dd className="break-words">{order.envio.nota}</dd>
          </div>
        ) : null}
        {order.notas ? (
          <div className="flex gap-2">
            <dt className="text-stone-500">Notas del cliente:</dt>
            <dd className="whitespace-pre-wrap break-words">{order.notas}</dd>
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
              <ItemNote note={item.nota} />
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {actions.returnOrder ? (
        returning ? (
          <div className="mt-3 space-y-3 rounded-xl border border-line p-3">
            <fieldset>
              <legend className="text-sm font-medium text-stone-700">¿Por qué lo devolvés?</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {returnKindOptions(Boolean(change)).map((option) => (
                  <button
                    key={option.kind}
                    type="button"
                    aria-pressed={returnKind === option.kind}
                    onClick={() => {
                      setReturnKind(option.kind);
                      setReasonError(null);
                    }}
                    className={`min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                      returnKind === option.kind
                        ? "border-red-600 bg-red-50 text-red-800"
                        : "border-line-strong text-stone-700 hover:bg-brand-soft"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>

            {returnKind === "other" ? (
              <label className="block text-sm text-stone-700">
                Contá el motivo
                <input
                  value={reason}
                  onChange={(event) => {
                    setReason(event.target.value);
                    setReasonError(null);
                  }}
                  maxLength={140}
                  placeholder="Me quedé sin nafta"
                  className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2 text-sm"
                />
              </label>
            ) : null}
            {reasonError ? <p className="text-xs text-red-700">{reasonError}</p> : null}
            <p className="text-xs text-stone-500">
              El pedido vuelve a los demás repartidores y vos no lo vas a volver a ver.
            </p>

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setReturning(false);
                  setReturnKind(null);
                  setReason("");
                  setReasonError(null);
                }}
                className="min-h-11 rounded-xl border border-line-strong px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-brand-soft"
              >
                Volver
              </button>
              <PendingButton
                busy={busy}
                pendingLabel="Devolviendo…"
                onClick={submitReturn}
                className="min-h-11 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                Confirmar devolución
              </PendingButton>
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => setReturning(true)}
              className="min-h-11 rounded-xl border border-red-200 px-5 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
            >
              Devolver
            </button>
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
              className="mt-2 min-h-11 rounded-xl bg-action px-5 py-2 text-sm font-semibold text-white transition hover:bg-action-hover disabled:opacity-60"
            >
              Rendido
            </button>
          ) : null}
        </div>
      ) : null}

      {actions.onTheWay ? (
        <EtaPicker
          title="Salgo hacia el cliente: llego en…"
          busy={busy}
          onPick={(minutes) => onAdvance("on_the_way", minutes)}
        />
      ) : null}

      {order.estado === "on_the_way" && onSetEta ? (
        dropoffEta && !changingDropoff ? (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-sm font-medium text-stone-800">
            {dropoffEta}
            <button
              type="button"
              disabled={busy}
              onClick={() => setChangingDropoff(true)}
              className="rounded-lg border border-line-strong px-2.5 py-1 text-xs font-medium text-brand transition hover:bg-brand-soft disabled:opacity-60"
            >
              Cambiar
            </button>
          </p>
        ) : (
          <EtaPicker title="Llego al cliente en…" busy={busy} onPick={(minutes) => setEta("dropoff", minutes)} />
        )
      ) : null}

      {actions.onTheWay || actions.delivered ? (
        <div className="mt-3">
          <PendingButton
            busy={busy}
            pendingLabel={actions.onTheWay ? "Marcando en camino…" : "Marcando entregado…"}
            onClick={() => onAdvance(actions.onTheWay ? "on_the_way" : "delivered")}
            className="min-h-11 w-full rounded-xl bg-action px-5 py-2 text-sm font-semibold text-white transition hover:bg-action-hover disabled:opacity-60 sm:w-auto"
          >
            {actions.onTheWay ? "En camino" : "Entregado"}
          </PendingButton>
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
        loadingLabel="Guardando…"
        loading={busy}
        onConfirm={async () => {
          await onSettle();
          setSettling(false);
        }}
        onClose={() => setSettling(false)}
      />
    </article>
  );
}
