"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { OwnZoneResult } from "@/lib/courier/own-zones";

// "Puede editar sus zonas y precios" (ENVIO-221): lo da el superadmin. Sin el permiso, el repartidor ve sus zonas
// en "Mis zonas y precios" pero las carga solo el superadmin. Se guarda al tocar.
export default function CanEditZonesToggle({
  canEdit,
  action,
}: {
  canEdit: boolean;
  action: (canEdit: boolean) => Promise<OwnZoneResult>;
}) {
  const router = useRouter();

  const [checked, setChecked] = useState(canEdit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(next: boolean) {
    setError(null);
    setBusy(true);
    setChecked(next);

    try {
      const result = await action(next);

      if (!result.ok) {
        setChecked(!next);
        setError(result.error);
      }
    } catch {
      setChecked(!next);
      setError("No pudimos guardar el cambio. Probá de nuevo.");
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <div>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={checked}
          disabled={busy}
          onChange={(event) => void change(event.target.checked)}
        />
        Puede editar sus zonas y precios
      </label>
      <p className="mt-1 text-sm text-stone-500">
        {checked
          ? "El repartidor carga y cambia sus zonas y precios desde su panel."
          : "Solo las cargás vos; el repartidor las ve pero no las cambia."}
      </p>
      {error ? (
        <p role="alert" className="mt-1 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
