"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { setAvailableAction } from "../actions";
import { AVAILABILITY_TEXTS, type AvailabilityLang, type AvailabilityStatus } from "@/lib/courier/availability";
import { formatClock } from "@/lib/orders/prep";
import { useAvailabilityChanges } from "@/lib/realtime/useOrderChanges";

// "Estoy disponible" / "No disponible" arriba del panel del repartidor (ENVIO-191). Solo él lo cambia. Se apaga solo
// a las 4 horas sin actividad (ENVIO-194): el aviso llega por Realtime y el panel se actualiza sin recargar.
export default function AvailabilityToggle({
  status,
  lang,
}: {
  status: AvailabilityStatus;
  lang: AvailabilityLang;
}) {
  const router = useRouter();
  const text = AVAILABILITY_TEXTS[lang];

  // Mientras viaja el cambio se muestra ya el estado nuevo; si falla, vuelve al de la base.
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useAvailabilityChanges(() => router.refresh());

  // El estado de la base ya llegó: se suelta lo optimista. Si nunca llega (se cortó la red), a los 5 segundos.
  const fromServer = `${status.available}|${status.since}`;
  const [seen, setSeen] = useState(fromServer);
  if (seen !== fromServer) {
    setSeen(fromServer);
    setOptimistic(null);
  }

  useEffect(() => {
    if (optimistic === null) return;
    const id = setTimeout(() => setOptimistic(null), 5000);
    return () => clearTimeout(id);
  }, [optimistic]);

  const on = optimistic ?? status.available;

  async function change() {
    if (optimistic !== null) return;

    setOptimistic(!on);
    setError(null);

    try {
      const result = await setAvailableAction(!on);

      if (!result.ok) {
        setError(text.error);
        setOptimistic(null);
      }
    } catch {
      setError(text.error);
      setOptimistic(null);
    } finally {
      router.refresh();
    }
  }

  return (
    <section
      aria-label={text.on}
      className={`rounded-3xl border p-4 shadow-sm transition-colors sm:p-5 ${
        on ? "border-action bg-white" : "border-line bg-white"
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p id="availability-label" className="flex items-center gap-2 text-xl font-bold text-brand">
            <span
              aria-hidden="true"
              className={`h-3 w-3 shrink-0 rounded-full ${on ? "bg-action" : "bg-stone-300"}`}
            />
            {on ? text.on : text.off}
          </p>
          {on && status.since ? (
            <p className="mt-0.5 text-sm font-medium text-stone-700">{text.since(formatClock(status.since))}</p>
          ) : null}
          <p className="mt-1 text-xs text-stone-500">{text.hint}</p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="availability-label"
          disabled={optimistic !== null}
          onClick={change}
          className={`relative h-10 w-[72px] shrink-0 rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-70 ${
            on ? "bg-action" : "bg-stone-300"
          }`}
        >
          <span
            aria-hidden="true"
            className={`absolute top-1 h-8 w-8 rounded-full bg-white shadow transition-all ${
              on ? "left-[36px]" : "left-1"
            }`}
          />
        </button>
      </div>

      {error ? (
        <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
    </section>
  );
}
