"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { setAvailableAction } from "../actions";
import { AVAILABILITY_TEXTS, type AvailabilityLang, type AvailabilityStatus } from "@/lib/courier/availability";
import { formatClock } from "@/lib/orders/prep";
import { useAvailabilityChanges } from "@/lib/realtime/useOrderChanges";

// "Conectado" / "No conectado" junto al título del panel del repartidor (ENVIO-191): un círculo verde o rojo y una
// palabra, que también es el interruptor. Solo él lo cambia. Se apaga solo a las 4 horas sin actividad (ENVIO-194):
// el aviso llega por Realtime y el estado se actualiza sin recargar. La hora de conexión y la regla de las 4 horas
// van en el tooltip, no ocupan lugar en la pantalla.
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

  const detail = on && status.since ? `${text.since(formatClock(status.since))}. ${text.hint}` : text.hint;

  return (
    <div className="flex items-center gap-2">
      <button
        data-tour="available"
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={text.on}
        title={detail}
        disabled={optimistic !== null}
        onClick={change}
        className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-70 ${
          on ? "border-action/40 bg-white text-brand" : "border-line-strong bg-white text-stone-600"
        }`}
      >
        <span
          aria-hidden="true"
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${on ? "bg-green-500" : "bg-red-500"}`}
        />
        {on ? text.on : text.off}
      </button>

      {error ? (
        <p role="alert" className="max-w-40 text-xs leading-tight text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
