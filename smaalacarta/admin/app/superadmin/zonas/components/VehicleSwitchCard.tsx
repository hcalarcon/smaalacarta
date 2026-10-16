"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { setVehicleSwitchAction } from "../actions";

// El interruptor "Vehículo del repartidor (moto/auto)" de toda la plataforma (ENVIO-175). Arranca apagado.
// Apagado no se ven las casillas del perfil, ni "Necesita auto", ni los íconos, y el servidor no filtra a
// nadie; los datos cargados se conservan.
export default function VehicleSwitchCard({ enabled }: { enabled: boolean }) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change() {
    setLoading(true);
    setError(null);

    try {
      const result = await setVehicleSwitchAction(!enabled);
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
          <h2 id="vehicle-switch-title" className="text-lg font-semibold text-brand">
            Vehículo del repartidor (moto/auto)
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            Prendido: cada repartidor marca si anda en moto, en auto o en los dos, el local puede pedir auto en un pedido
            y solo lo ven, toman u ofertan quienes lo tienen. No cambia el precio.
          </p>
          <p className="mt-1 text-sm text-stone-600">
            {enabled ? "Prendido para toda la plataforma." : "Apagado: no se ve ni filtra nada. Lo cargado se conserva."}
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="vehicle-switch-title"
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
