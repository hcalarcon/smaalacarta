"use client";

import { useState } from "react";

import type { AvailableOrder } from "@/lib/courier/panel";
import {
  collectionInfo,
  validateCourierResponse,
  type CourierResponseInput,
} from "@/lib/orders/courier";
import { formatDateTime, timeAgo } from "@/lib/orders/format";
import { preorderLabel, scheduledLabel } from "@/lib/orders/scheduled";
import { formatMoney } from "@/lib/promotions/pricing";
import ConfirmDeleteDialog from "../../dashboard/components/ConfirmDeleteDialog";

type Errors = Partial<Record<"note" | "fee" | "reason", string>>;

// Un pedido que el repartidor puede tomar (ENVIO-71 y 77): local, barrio, cuánto se cobra y, si es
// programado, la hora bien visible. No hay nada del cliente hasta que lo toma. Todo texto del local
// se escribe como texto, nunca como HTML.
export default function AvailableOrderCard({
  order,
  now,
  busy,
  error,
  onTake,
  onDecline,
}: {
  order: AvailableOrder;
  now: Date;
  busy: boolean;
  error: string | null;
  onTake: (input: CourierResponseInput) => void;
  onDecline: () => void;
}) {
  const [taking, setTaking] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");
  const [fee, setFee] = useState(() => String(order.envio.precio ?? ""));
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Errors>({});

  const currentFee = Number(order.envio.precio ?? 0);
  const listFee = order.envio.precio_lista;
  const collection = collectionInfo({ payment: order.pago, total: order.total, fee: order.envio.precio });
  const when = order.anticipado ? preorderLabel(order.programado) : scheduledLabel(order.programado);
  const since = order.ofrecido_el ?? order.creado;

  // ¿El precio escrito es distinto del actual? Entonces el motivo es obligatorio.
  const typed = validateCourierResponse({ note: "", fee, reason: "-" }, currentFee);
  const feeChanged = taking && typed.ok && typed.fee !== null;

  function submit() {
    const input: CourierResponseInput = { note, fee, reason };

    const result = validateCourierResponse(input, currentFee);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }

    setErrors({});
    setTaking(false);
    onTake(input);
  }

  return (
    <article className="rounded-2xl border border-line bg-white p-4 shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-base font-semibold text-brand">
            #{order.numero} · {order.negocio.nombre}
          </p>
          <p className="text-xs text-stone-500">
            Buscando repartidor desde {formatDateTime(since)} · {timeAgo(since, now)}
          </p>
        </div>

        {order.pago_estado === "not_required" || order.pago_estado === "paid" ? null : (
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-600">
            Pago pendiente
          </span>
        )}
      </header>

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
            <p className="text-sm text-stone-600">{order.negocio.direccion}</p>
          ) : null}
        </section>

        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Entregar en</h3>
          <p className="mt-1 text-sm font-medium text-stone-900">{order.envio.zona ?? "-"}</p>
          <p className="text-xs text-stone-500">
            Los datos del cliente los ves cuando tomás el pedido.
          </p>
        </section>
      </div>

      <dl className="mt-3 space-y-1 rounded-xl bg-cream p-3 text-sm text-stone-700">
        <div className="flex gap-2">
          <dt className="text-stone-500">Precio del envío:</dt>
          <dd className="font-medium">{formatMoney(Number(listFee ?? currentFee))}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-stone-500">Total del pedido (lo cobra el local):</dt>
          <dd className="font-medium">{formatMoney(Number(order.total))}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-stone-500">Pago:</dt>
          <dd>{order.pago || "-"}</dd>
        </div>
      </dl>

      <p
        className={`mt-3 rounded-xl px-3 py-2 text-sm font-semibold ${
          collection.cash ? "bg-amber-100 text-amber-900" : "bg-sky-50 text-sky-900"
        }`}
      >
        💵 {collection.text}
      </p>

      {error ? (
        <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {taking ? (
        <div className="mt-3 space-y-3 rounded-xl border border-line p-3">
          <label className="block text-sm text-stone-700">
            Nota (opcional)
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={120}
              placeholder="Juan, 21:30"
              className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2 text-sm"
            />
            {errors.note ? <span className="text-xs text-red-700">{errors.note}</span> : null}
          </label>

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

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setTaking(false);
                setErrors({});
              }}
              className="rounded-xl border border-line-strong px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-brand-soft"
            >
              Volver
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={submit}
              className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60"
            >
              Confirmar: lo tomo
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => setTaking(true)}
            className="min-h-11 rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60"
          >
            Tomar
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
        description={`¿Rechazás el pedido #${order.numero} de ${order.negocio.nombre}? Deja de aparecerte; los demás repartidores lo siguen viendo.`}
        confirmLabel="Sí, rechazar"
        loadingLabel="Guardando..."
        loading={busy}
        onConfirm={() => {
          setDeclining(false);
          onDecline();
        }}
        onClose={() => setDeclining(false)}
      />
    </article>
  );
}
