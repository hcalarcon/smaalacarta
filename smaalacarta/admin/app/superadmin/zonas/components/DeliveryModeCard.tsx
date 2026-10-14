"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import ConfirmDeleteDialog from "../../../dashboard/components/ConfirmDeleteDialog";
import { setDeliveryModeAction } from "../actions";
import type { DeliveryMode } from "@/lib/db/platform-settings";

const MODES: { value: DeliveryMode; label: string; help: string }[] = [
  {
    value: "fixed",
    label: "Precio fijo",
    help: "El primer repartidor que toma el pedido se lo queda, al precio de lista de la zona.",
  },
  {
    value: "offers",
    label: "Ofertas",
    help: "Los repartidores ofertan y el cliente elige; si no elige, se asigna sola la más barata.",
  },
];

const labelOf = (mode: DeliveryMode) => MODES.find((item) => item.value === mode)?.label ?? mode;

// El interruptor del modo de envíos de toda la plataforma (ENVIO-145 y 152). Cambiarlo pide confirmar:
// los pedidos en curso siguen con el modo anterior y solo los nuevos usan el elegido.
export default function DeliveryModeCard({ mode, searching }: { mode: DeliveryMode; searching: number }) {
  const router = useRouter();

  const [pendingMode, setPendingMode] = useState<DeliveryMode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!pendingMode) return;

    setLoading(true);
    setError(null);

    try {
      const result = await setDeliveryModeAction(pendingMode);
      if (!result.ok) setError(result.error);
    } catch {
      setError("No pudimos guardar el cambio. Probá de nuevo.");
    } finally {
      setLoading(false);
      setPendingMode(null);
      router.refresh();
    }
  }

  return (
    <section className="rounded-3xl border border-line bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-brand">Modo de envíos</h2>
      <p className="mt-1 text-sm text-stone-500">
        Vale para toda la plataforma. Cada pedido sigue con el modo con el que nació.
      </p>

      {error ? (
        <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div role="radiogroup" aria-label="Modo de envíos" className="mt-4 grid gap-3 sm:grid-cols-2">
        {MODES.map((item) => {
          const selected = item.value === mode;

          return (
            <button
              key={item.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={loading}
              onClick={() => {
                if (!selected) setPendingMode(item.value);
              }}
              className={`min-h-11 rounded-2xl border p-4 text-left transition disabled:opacity-60 ${
                selected ? "border-action bg-cream" : "border-line bg-white hover:bg-cream"
              }`}
            >
              <span className="block text-sm font-semibold text-brand">
                {item.label}
                {selected ? " · activo" : ""}
              </span>
              <span className="mt-1 block text-sm text-stone-600">{item.help}</span>
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-sm text-stone-600">
        {searching === 0
          ? "Ahora no hay pedidos buscando repartidor."
          : searching === 1
            ? "Ahora hay 1 pedido buscando repartidor."
            : `Ahora hay ${searching} pedidos buscando repartidor.`}
      </p>

      <ConfirmDeleteDialog
        open={pendingMode !== null}
        title="Cambiar el modo de envíos"
        description={`Los pedidos en curso siguen con el modo anterior. Los nuevos usan ${
          pendingMode ? labelOf(pendingMode) : ""
        }.`}
        confirmLabel="Cambiar"
        loadingLabel="Cambiando…"
        loading={loading}
        onConfirm={confirm}
        onClose={() => setPendingMode(null)}
      />
    </section>
  );
}
