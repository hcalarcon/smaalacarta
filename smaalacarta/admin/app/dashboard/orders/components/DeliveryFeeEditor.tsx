"use client";

import { useState } from "react";

import { parsePrice } from "@/lib/superadmin/zones";

export const FEE_PENDING_LABEL = "Costo de envío a confirmar";

// El costo de un envío a coordinar con el cliente (ENVIO-252, 253 y 262): mientras no está cargado se ve bien
// destacado con el campo para cargarlo; cargado, se puede corregir. El precio acepta coma o punto decimal.
export default function DeliveryFeeEditor({
  pending,
  current,
  busy,
  onSave,
  compact = false,
}: {
  // Sin precio todavía.
  pending: boolean;
  // El precio cargado, ya formateado ("$ 1.500,00"), si lo hay.
  current?: string;
  busy: boolean;
  // Devuelve un mensaje de error, o nada si se guardó.
  onSave: (fee: string) => Promise<string | void>;
  compact?: boolean;
}) {
  const [editing, setEditing] = useState(pending);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Si el precio se cargó desde otro lado, deja de estar pendiente y se cierra el campo.
  const [seenPending, setSeenPending] = useState(pending);
  if (seenPending !== pending) {
    setSeenPending(pending);
    setEditing(pending);
  }

  async function save() {
    if (parsePrice(value) === null) {
      setError("Escribí un precio válido, de 0 en adelante.");
      return;
    }

    setError(null);
    setSaving(true);

    try {
      const failure = await onSave(value);
      if (failure) {
        setError(failure);
      } else {
        setValue("");
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <p className={compact ? "mt-1 text-[11px]" : "mt-1 text-sm"}>
        <span className="text-stone-500">Costo coordinado: </span>
        <span className="font-semibold">{current}</span>{" "}
        <button
          type="button"
          disabled={busy}
          onClick={() => setEditing(true)}
          className="font-medium text-accent underline hover:text-accent-hover disabled:opacity-60"
        >
          Corregir
        </button>
      </p>
    );
  }

  return (
    <div
      className={`mt-1 rounded-lg border border-amber-300 bg-amber-50 ${compact ? "p-2" : "p-3"}`}
      role={pending ? "group" : undefined}
      aria-label={pending ? FEE_PENDING_LABEL : "Corregir el costo del envío"}
    >
      <p className={`font-semibold text-amber-900 ${compact ? "text-[11px]" : "text-sm"}`}>
        {pending ? `⚠ ${FEE_PENDING_LABEL}` : "Corregir el costo del envío"}
      </p>
      {pending ? (
        <p className={`text-amber-900 ${compact ? "text-[11px]" : "text-xs"}`}>
          Acordalo con el cliente y cargalo: él lo ve en el seguimiento.
        </p>
      ) : null}

      <div className="mt-1.5 flex items-start gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Costo del envío</span>
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void save();
              }
            }}
            inputMode="decimal"
            placeholder="Ej. 1500 o 1500,50"
            aria-invalid={error ? true : undefined}
            className="min-h-11 w-full rounded-lg border border-line-strong bg-white px-3 py-2 text-base focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 sm:text-sm"
          />
        </label>
        <button
          type="button"
          disabled={busy || saving}
          onClick={() => void save()}
          className="min-h-11 shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60"
        >
          {saving ? "Guardando…" : "Cargar"}
        </button>
        {!pending ? (
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setError(null);
              setValue("");
            }}
            className="min-h-11 shrink-0 rounded-lg border border-line-strong bg-white px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-brand-soft"
          >
            Cancelar
          </button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
