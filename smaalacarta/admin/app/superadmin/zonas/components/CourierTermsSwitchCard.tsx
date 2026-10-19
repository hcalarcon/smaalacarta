"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { setCourierTermsSwitchAction } from "../actions";

// El interruptor "Exigir términos a repartidores" de toda la plataforma (ENVIO-181). Arranca prendido.
// Apagado no se muestra la pantalla de términos y el servidor no bloquea a nadie; las aceptaciones se conservan.
export default function CourierTermsSwitchCard({ enabled, version }: { enabled: boolean; version: number }) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change() {
    setLoading(true);
    setError(null);

    try {
      const result = await setCourierTermsSwitchAction(!enabled);
      if (!result.ok) setError(result.error);
    } catch {
      setError("No pudimos guardar el cambio. Probá de nuevo.");
    } finally {
      setLoading(false);
      router.refresh();
    }
  }

  return (
    <section className="rounded-3xl border border-line bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="terms-switch-title" className="text-lg font-semibold text-brand">
            Exigir términos a repartidores
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            Prendido: el repartidor que no aceptó la versión vigente de los términos ve la pantalla de términos, no ve pedidos y no puede tomar ni ofertar. Si subís la versión, todos vuelven a aceptar.
          </p>
          <p className="mt-1 text-sm text-stone-600">
            {enabled ? `Prendido (términos versión ${version}).` : "Apagado: no se muestra la pantalla ni se bloquea nada. Lo aceptado se conserva."}
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="terms-switch-title"
          disabled={loading}
          onClick={change}
          className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition disabled:opacity-60 ${
            enabled ? "bg-action" : "bg-stone-300"
          }`}
        >
          <span
            aria-hidden="true"
            className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${
              enabled ? "left-[22px]" : "left-0.5"
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
