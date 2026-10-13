"use client";

import { useEffect, useState } from "react";

import {
  PREP_MAX,
  PREP_MIN,
  PREP_QUICK_MINUTES,
  prepSelectorDefault,
  validatePrepMinutes,
} from "@/lib/orders/prep";

// El selector del tiempo estimado (ADMIN-PEDIDOS-31 y 32): al aceptar un pedido, o para cargarlo después en
// uno que se aceptó sin tiempo. Solo pinta; la regla del rango y el valor preseleccionado están en `prep.ts`.
export default function PrepPicker({
  orderNumber,
  mode,
  suggested,
  defaultMinutes,
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
  busy: boolean;
  error: string | null;
  onConfirm: (minutes: number) => void;
  onAcceptWithout?: () => void;
  onClose: () => void;
}) {
  const initial = prepSelectorDefault(suggested, defaultMinutes);
  // Texto, para poder borrar y escribir.
  const [value, setValue] = useState(String(initial.minutes));

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

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="prep-picker-title"
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl"
      >
        <h2 id="prep-picker-title" className="text-xl font-semibold text-brand">
          {mode === "accept" ? `Aceptar pedido #${orderNumber}` : `Tiempo del pedido #${orderNumber}`}
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          ¿En cuántos minutos va a estar listo? Es una estimación: el cliente la ve como «aprox.».
        </p>

        {initial.suggested ? (
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
          <button
            type="button"
            disabled={busy || minutes === null}
            onClick={() => minutes !== null && onConfirm(minutes)}
            className="min-h-12 rounded-2xl bg-brand px-5 py-3 text-base font-bold text-white transition hover:bg-brand-hover disabled:opacity-60"
          >
            {busy ? "Guardando…" : minutes === null ? `${verb} …` : `${verb} ${minutes} min`}
          </button>

          {mode === "accept" && onAcceptWithout ? (
            <button
              type="button"
              disabled={busy}
              onClick={onAcceptWithout}
              className="min-h-11 rounded-2xl border border-line-strong bg-white px-5 py-2 text-sm font-semibold text-brand transition hover:bg-cream disabled:opacity-60"
            >
              Aceptar sin tiempo
            </button>
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
