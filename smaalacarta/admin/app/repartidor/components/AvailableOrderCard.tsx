"use client";

import { paymentLabel } from "@/lib/orders/labels";
import { useState } from "react";

import {
  myOfferLabel,
  offersCountLabel,
  resultNotice,
  type AvailableOrder,
} from "@/lib/courier/panel";
import { collectionInfo, validateOffer, type OfferInput } from "@/lib/orders/courier";
import { formatDateTime, timeAgo } from "@/lib/orders/format";
import { preorderLabel, scheduledLabel } from "@/lib/orders/scheduled";
import { formatMoney } from "@/lib/promotions/pricing";
import PendingButton from "@/components/ui/PendingButton";
import ConfirmDeleteDialog from "../../dashboard/components/ConfirmDeleteDialog";

type Errors = Partial<Record<"price" | "reason", string>>;

// Un pedido por el que el repartidor puede ofertar (ENVIO-71 y 113 a 115): local, barrio, precio de lista,
// hora y cuántas ofertas hay; sin nada del cliente hasta que lo eligen. Si su oferta se cerró, muestra el
// aviso en lugar de las acciones. Todo texto del local se escribe como texto, nunca como HTML.
export default function AvailableOrderCard({
  order,
  now,
  busy,
  error,
  onOffer,
  onWithdraw,
  onDecline,
}: {
  order: AvailableOrder;
  now: Date;
  busy: boolean;
  error: string | null;
  // Pueden devolver una promesa: el botón espera lo que tarde y no deja tocar de nuevo (ENVIO-144).
  onOffer: (input: OfferInput) => void | Promise<void>;
  onWithdraw: () => void | Promise<void>;
  onDecline: () => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [declining, setDeclining] = useState(false);
  const listPrice = Number(order.envio.precio_lista ?? 0);
  const mine = order.mi_oferta;
  const [price, setPrice] = useState(() => String(mine?.precio ?? listPrice));
  const [reason, setReason] = useState(() => mine?.motivo ?? "");
  const [errors, setErrors] = useState<Errors>({});

  const notice = resultNotice(order);
  const collection = collectionInfo({ payment: order.pago, total: order.total, fee: listPrice });
  const when = order.anticipado ? preorderLabel(order.programado) : scheduledLabel(order.programado);
  const since = order.ofrecido_el ?? order.creado;

  // ¿El precio escrito es distinto del de lista? Entonces el motivo es obligatorio.
  const typed = validateOffer({ price, reason: "-" }, listPrice);
  const priceChanged = typed.ok && typed.price !== listPrice;

  function submit(input: OfferInput) {
    const result = validateOffer(input, listPrice);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }

    setErrors({});
    // El formulario sigue a la vista mientras espera, para que se vea el "Ofertando…".
    return Promise.resolve(onOffer(input)).finally(() => setEditing(false));
  }

  return (
    <article
      className={`rounded-2xl border p-4 shadow-sm ${notice ? "border-stone-200 bg-stone-50" : "border-line bg-white"}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-base font-semibold text-brand">
            #{order.numero} · {order.negocio.nombre}
          </p>
          <p className="text-xs text-stone-500">
            Pedido de las {formatDateTime(order.creado)} · {timeAgo(since, now)}
          </p>
        </div>

        {order.pago_estado === "not_required" || order.pago_estado === "paid" ? null : (
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-600">
            Pago pendiente
          </span>
        )}
      </header>

      {notice ? (
        <p role="status" className="mt-3 rounded-xl bg-stone-200 px-3 py-2 text-sm font-semibold text-stone-800">
          {notice}
        </p>
      ) : null}

      {when ? (
        <p className="mt-3 rounded-xl bg-amber-100 px-3 py-2 text-base font-bold text-amber-900">
          🕒 {when}
        </p>
      ) : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Retirar en</h3>
          <p className="mt-1 text-sm font-medium text-stone-900">{order.negocio.nombre}</p>
          {order.negocio.direccion ? (
            <p className="break-words text-sm text-stone-600">{order.negocio.direccion}</p>
          ) : null}
        </section>

        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Entregar en</h3>
          <p className="mt-1 text-sm font-medium text-stone-900">{order.envio.zona ?? "-"}</p>
          <p className="text-xs text-stone-500">
            Los datos del cliente los ves cuando te eligen.
          </p>
        </section>
      </div>

      <dl className="mt-3 space-y-1 rounded-xl bg-cream p-3 text-sm text-stone-700">
        <div className="flex gap-2">
          <dt className="text-stone-500">Precio de lista del envío:</dt>
          <dd className="font-medium">{formatMoney(listPrice)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-stone-500">Total del pedido (lo cobra el local):</dt>
          <dd className="font-medium">{formatMoney(Number(order.total))}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-stone-500">Pago:</dt>
          <dd>{paymentLabel(order.pago) || "-"}</dd>
        </div>
        {notice ? null : (
          <div className="flex gap-2">
            <dt className="text-stone-500">Ofertas:</dt>
            <dd className="font-medium">{offersCountLabel(order.ofertas)}</dd>
          </div>
        )}
      </dl>

      {notice ? null : (
        <p
          className={`mt-3 rounded-xl px-3 py-2 text-sm font-semibold ${
            collection.cash ? "bg-amber-100 text-amber-900" : "bg-sky-50 text-sky-900"
          }`}
        >
          💵 {collection.text}
        </p>
      )}

      {error ? (
        <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {notice ? null : mine && !editing ? (
        <div className="mt-3 space-y-2">
          <p className="rounded-xl bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-900">
            {myOfferLabel(order, formatMoney)}
          </p>
          {mine.motivo ? <p className="text-xs text-stone-500">Motivo: {mine.motivo}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing(true)}
              className="min-h-11 rounded-xl border border-line-strong bg-white px-5 py-2 text-sm font-semibold text-brand transition hover:bg-cream disabled:opacity-60"
            >
              Cambiar
            </button>
            <PendingButton
              busy={busy}
              pendingLabel="Retirando…"
              onClick={onWithdraw}
              className="min-h-11 rounded-xl border border-line-strong bg-white px-5 py-2 text-sm font-semibold text-stone-700 transition hover:bg-cream disabled:opacity-60"
            >
              Retirar
            </PendingButton>
            <button
              type="button"
              disabled={busy}
              onClick={() => setDeclining(true)}
              className="min-h-11 rounded-xl border border-red-200 px-5 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
            >
              Rechazar
            </button>
          </div>
        </div>
      ) : editing ? (
        <div className="mt-3 space-y-3 rounded-xl border border-line p-3">
          <label className="block text-sm text-stone-700">
            Precio de tu oferta
            <input
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2 text-sm"
            />
            {errors.price ? <span className="text-xs text-red-700">{errors.price}</span> : null}
          </label>

          {priceChanged || errors.reason ? (
            <label className="block text-sm text-stone-700">
              Motivo del cambio de precio (lo ve el cliente)
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={140}
                placeholder="Fuera de zona"
                className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2 text-sm"
              />
              {errors.reason ? <span className="text-xs text-red-700">{errors.reason}</span> : null}
            </label>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setErrors({});
              }}
              className="min-h-11 rounded-xl border border-line-strong px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-brand-soft"
            >
              Volver
            </button>
            <PendingButton
              busy={busy}
              pendingLabel={mine ? "Cambiando…" : "Ofertando…"}
              onClick={() => submit({ price, reason })}
              className="min-h-11 rounded-xl bg-action px-4 py-2 text-sm font-semibold text-white transition hover:bg-action-hover disabled:opacity-60"
            >
              Confirmar oferta
            </PendingButton>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <PendingButton
            busy={busy}
            pendingLabel="Ofertando…"
            onClick={() => submit({ price: String(listPrice), reason: "" })}
            className="min-h-11 rounded-xl bg-action px-5 py-2 text-sm font-semibold text-white transition hover:bg-action-hover disabled:opacity-60"
          >
            Ofertar {formatMoney(listPrice)}
          </PendingButton>
          <button
            type="button"
            disabled={busy}
            onClick={() => setEditing(true)}
            className="min-h-11 rounded-xl border border-line-strong bg-white px-5 py-2 text-sm font-semibold text-brand transition hover:bg-cream disabled:opacity-60"
          >
            Otro precio
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setDeclining(true)}
            className="min-h-11 rounded-xl border border-red-200 px-5 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
          >
            Rechazar
          </button>
        </div>
      )}

      <ConfirmDeleteDialog
        open={declining}
        title="Rechazar el pedido"
        description={`¿Rechazás el pedido #${order.numero} de ${order.negocio.nombre}? Deja de aparecerte${
          mine ? " y se retira tu oferta" : ""
        }; los demás repartidores lo siguen viendo.`}
        confirmLabel="Sí, rechazar"
        loadingLabel="Rechazando…"
        loading={busy}
        onConfirm={async () => {
          await onDecline();
          setDeclining(false);
        }}
        onClose={() => setDeclining(false)}
      />
    </article>
  );
}
