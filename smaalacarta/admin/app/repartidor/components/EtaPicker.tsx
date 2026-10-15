"use client";

import { useState } from "react";

import { ETA_MAX, ETA_MIN, ETA_QUICK_MINUTES, validateEta } from "@/lib/courier/times";
import PendingButton from "@/components/ui/PendingButton";

// "Llego al local en…" y "Llego al cliente en…" (ENVIO-157 y 163): botones rápidos más un campo libre de 1 a
// 120 minutos. Cada botón espera la respuesta y no deja tocar de nuevo. `onPick` puede devolver una promesa.
export default function EtaPicker({
  title,
  busy,
  onPick,
}: {
  title: string;
  busy: boolean;
  onPick: (minutes: number) => void | Promise<void>;
}) {
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submitCustom() {
    const result = validateEta(custom);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setError(null);
    return onPick(result.minutes);
  }

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-line p-3">
      <p className="text-sm font-semibold text-stone-800">{title}</p>

      <div className="flex flex-wrap gap-2">
        {ETA_QUICK_MINUTES.map((minutes) => (
          <PendingButton
            key={minutes}
            busy={busy}
            pendingLabel="Guardando…"
            onClick={() => onPick(minutes)}
            className="min-h-11 rounded-xl border border-line-strong bg-white px-4 py-2 text-sm font-semibold text-brand transition hover:bg-cream disabled:opacity-60"
          >
            {minutes} min
          </PendingButton>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm text-stone-700">
          Otro tiempo (minutos)
          <input
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            inputMode="numeric"
            placeholder={`${ETA_MIN} a ${ETA_MAX}`}
            className="mt-1 block w-32 rounded-lg border border-line-strong px-3 py-2 text-sm"
          />
        </label>
        <PendingButton
          busy={busy}
          pendingLabel="Guardando…"
          onClick={submitCustom}
          className="min-h-11 rounded-xl bg-action px-4 py-2 text-sm font-semibold text-white transition hover:bg-action-hover disabled:opacity-60"
        >
          Guardar
        </PendingButton>
      </div>

      {error ? (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
