"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { setZoneCoverageAction } from "../../actions";
import type { CoverageZone } from "@/lib/db/courier";
import { formatMoney } from "@/lib/promotions/pricing";

// Mis zonas (ENVIO-57): las zonas activas de la plataforma con su precio de referencia y una casilla
// "La llevo". Se guarda al tocar. Los nombres y los precios los administra el equipo de SMA a la Carta.
export default function CoverageClient({ zones }: { zones: CoverageZone[] }) {
  const router = useRouter();

  const [items, setItems] = useState(zones);
  const [seen, setSeen] = useState(zones);
  if (seen !== zones) {
    setSeen(zones);
    setItems(zones);
  }

  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(zone: CoverageZone, covered: boolean) {
    setError(null);
    setPending(zone.id);
    // Se ve la marca enseguida; si falla, vuelve a como estaba.
    setItems((current) => current.map((item) => (item.id === zone.id ? { ...item, covered } : item)));

    try {
      const result = await setZoneCoverageAction(zone.id, covered);

      if (!result.ok) {
        setItems((current) => current.map((item) => (item.id === zone.id ? { ...item, covered: !covered } : item)));
        setError(result.error);
      }
    } catch {
      setItems((current) => current.map((item) => (item.id === zone.id ? { ...item, covered: !covered } : item)));
      setError("No pudimos guardar el cambio. Probá de nuevo.");
    } finally {
      setPending(null);
      router.refresh();
    }
  }

  const count = items.filter((zone) => zone.covered).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section>
        <h1 className="text-3xl font-bold text-brand">Mis zonas</h1>
        <p className="mt-2 text-stone-500">
          Marcá las zonas que llevás. Los locales solo ofrecen las zonas que alguien cubre. El precio es de
          referencia: lo podés ajustar, con un motivo, al aceptar cada pedido.
        </p>
      </section>

      {error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <section className="rounded-3xl border border-line bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-brand">
          Zonas <span className="text-sm font-normal text-stone-500">({count} de {items.length})</span>
        </h2>

        {items.length === 0 ? (
          <p className="mt-4 text-sm text-stone-400">Todavía no hay zonas cargadas.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-stone-500">
              <span className="font-medium text-stone-700">Precio de referencia</span>: se puede cambiar al aceptar un pedido.
            </p>
            <ul className="mt-3 divide-y divide-line">
            {items.map((zone) => (
              <li key={zone.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 py-2">
                  <input
                    type="checkbox"
                    checked={zone.covered}
                    disabled={pending === zone.id}
                    onChange={(event) => void toggle(zone, event.target.checked)}
                    className="h-5 w-5"
                  />
                  <span className="min-w-0 flex-1 truncate text-stone-900">{zone.name}</span>
                  <span className="text-sm text-stone-600">{formatMoney(zone.price)}</span>
                  <span className="text-sm font-medium text-brand">{zone.covered ? "La llevo" : ""}</span>
                </label>
              </li>
            ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
