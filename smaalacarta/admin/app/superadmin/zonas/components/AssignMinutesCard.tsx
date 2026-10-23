"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ASSIGN_MINUTES_MAX, ASSIGN_MINUTES_MIN } from "@/lib/orders/assign-minutes";

import { setAssignMinutesAction } from "../actions";

// "Tiempo para asignar a mano" de toda la plataforma (ENVIO-241 y 244). Pasados estos minutos sin ofertas, el tablero
// del local destaca el pedido y le llega el aviso. Arranca en 5.
export default function AssignMinutesCard({ minutes }: { minutes: number }) {
  const router = useRouter();

  const [value, setValue] = useState(String(minutes));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSaved(false);

    try {
      const result = await setAssignMinutesAction(value);
      if (result.ok) setSaved(true);
      else setError(result.error);
    } catch {
      setError("No pudimos guardar el cambio. Probá de nuevo.");
    } finally {
      setLoading(false);
      router.refresh();
    }
  }

  return (
    <section className="rounded-3xl border border-line bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-brand">Tiempo para asignar a mano</h2>
      <p className="mt-1 text-sm text-stone-500">
        Si un pedido con envío lleva este tiempo sin ninguna oferta, el tablero del local lo destaca (&ldquo;asignalo a
        mano o llevalo vos&rdquo;) y le llega un aviso. No cambia los 5 minutos en que el cliente elige entre ofertas.
      </p>

      <form onSubmit={save} className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium text-stone-700">
          Minutos ({ASSIGN_MINUTES_MIN} a {ASSIGN_MINUTES_MAX})
          <input
            type="number"
            inputMode="numeric"
            min={ASSIGN_MINUTES_MIN}
            max={ASSIGN_MINUTES_MAX}
            step={1}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="mt-1 block min-h-11 w-28 rounded-xl border border-line-strong px-3 py-2 text-base"
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="min-h-11 rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60"
        >
          {loading ? "Guardando…" : "Guardar"}
        </button>

        {saved ? (
          <p role="status" className="text-sm text-emerald-700">
            Guardado.
          </p>
        ) : null}
      </form>

      {error ? (
        <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
    </section>
  );
}
