"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";

import PendingButton from "@/components/ui/PendingButton";
import {
  PREP_MAX,
  PREP_MIN,
  PREP_QUICK_MINUTES,
  prepSelectorDefault,
  validatePrepMinutes,
} from "@/lib/orders/prep";

// Un doble click rápido en "Aceptar" abre este selector con el primer toque y el segundo cae encima de él: si
// llega dentro de este margen y es el segundo de la secuencia (`detail > 1`), no cuenta (ENVIO-171).
const DOUBLE_CLICK_GUARD_MS = 600;

// El selector del tiempo estimado (ADMIN-PEDIDOS-31 y 32): al aceptar un pedido, o para cargarlo después en
// uno que se aceptó sin tiempo. Solo pinta; la regla del rango y el valor preseleccionado están en `prep.ts`.
export default function PrepPicker({
  orderNumber,
  mode,
  suggested,
  defaultMinutes,
  lastUsed = null,
  busy,
  error,
  onConfirm,
  onAcceptWithout,
  onClose,
}: {
  orderNumber: string;
  // `accept`: el pedido está pendiente y se acepta con o sin tiempo. `set`: ya está aceptado.
  mode: "accept" | "set";
  // Lo que sugiere la base según los últimos pedidos del negocio; nulo si no hay suficientes.
  suggested: number | null;
  // El tiempo por defecto del negocio.
  defaultMinutes: number;
  // El último tiempo que usó el local en este navegador: tiene prioridad sobre la sugerencia.
  lastUsed?: number | null;
  busy: boolean;
  error: string | null;
  // Pueden devolver una promesa: el botón espera lo que tarde y no deja tocar de nuevo.
  onConfirm: (minutes: number) => void | Promise<void>;
  onAcceptWithout?: () => void | Promise<void>;
  onClose: () => void;
}) {
  const last = typeof lastUsed === "number" && validatePrepMinutes(lastUsed).ok ? lastUsed : null;
  const base = prepSelectorDefault(suggested, defaultMinutes);
  const initial = last !== null ? { minutes: last, suggested: false } : base;
  // Texto, para poder borrar y escribir.
  const [value, setValue] = useState(String(initial.minutes));
  const openedAt = useRef(Date.now());

  // En captura, antes de que el toque llegue a cualquier botón del diálogo.
  function ignoreSecondClick(event: MouseEvent) {
    if (event.detail > 1 && Date.now() - openedAt.current < DOUBLE_CLICK_GUARD_MS) {
      event.stopPropagation();
      event.preventDefault();
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const validation = validatePrepMinutes(value);
  const minutes = validation.ok ? validation.minutes : null;
  const verb = mode === "accept" ? "Aceptar con" : "Guardar";
  const pendingLabel = mode === "accept" ? "Aceptando…" : "Guardando…";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="prep-picker-title"
        onClickCapture={ignoreSecondClick}
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl"
      >
        <h2 id="prep-picker-title" className="text-xl font-semibold text-brand">
          {mode === "accept" ? `Aceptar pedido #${orderNumber}` : `Tiempo del pedido #${orderNumber}`}
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          ¿En cuántos minutos va a estar listo? Es una estimación: el cliente la ve como «aprox.».
        </p>

        {last !== null ? (
          <p className="mt-3 rounded-xl bg-cream px-3 py-2 text-sm font-medium text-brand">
            Último que usaste: {last} min
          </p>
        ) : initial.suggested ? (
          <p className="mt-3 rounded-xl bg-cream px-3 py-2 text-sm font-medium text-brand">
            Sugerido: {initial.minutes} min según tus últimos pedidos
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {PREP_QUICK_MINUTES.map((quick) => (
            <button
              key={quick}
              type="button"
              aria-pressed={minutes === quick}
              disabled={busy}
              onClick={() => setValue(String(quick))}
              className={`min-h-11 min-w-16 rounded-xl border px-4 text-sm font-semibold transition disabled:opacity-60 ${
                minutes === quick
                  ? "border-brand bg-brand text-white"
                  : "border-line-strong bg-white text-brand hover:bg-cream"
              }`}
            >
              {quick} min
            </button>
          ))}
        </div>

        <label className="mt-4 block text-sm font-medium text-stone-700">
          Otro valor (minutos)
          <input
            type="text"
            inputMode="numeric"
            maxLength={3}
            value={value}
            disabled={busy}
            onChange={(event) => setValue(event.target.value)}
            className="mt-1 block w-full rounded-xl border border-line px-3 py-2 text-base"
          />
        </label>

        {!validation.ok ? (
          <p className="mt-1.5 text-sm text-red-600">
            Poné un número entero de {PREP_MIN} a {PREP_MAX}.
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-2">
          <PendingButton
            pending={busy}
            pendingLabel={pendingLabel}
            disabled={minutes === null}
            onClick={() => (minutes !== null ? onConfirm(minutes) : undefined)}
            className="min-h-12 rounded-2xl bg-brand px-5 py-3 text-base font-bold text-white transition hover:bg-brand-hover disabled:opacity-60"
          >
            {minutes === null ? `${verb} …` : `${verb} ${minutes} min`}
          </PendingButton>

          {mode === "accept" && onAcceptWithout ? (
            <PendingButton
              busy={busy}
              pendingLabel="Aceptando…"
              onClick={onAcceptWithout}
              className="min-h-11 rounded-2xl border border-line-strong bg-white px-5 py-2 text-sm font-semibold text-brand transition hover:bg-cream disabled:opacity-60"
            >
              Aceptar sin tiempo
            </PendingButton>
          ) : null}

          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="min-h-11 rounded-2xl px-5 py-2 text-sm font-medium text-stone-600 transition hover:bg-cream disabled:opacity-60"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
