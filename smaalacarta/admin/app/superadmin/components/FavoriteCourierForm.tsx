"use client";

import { useActionState } from "react";

import { setFavoriteCourierAction, type SuperAdminFormState } from "../actions";
import FormAlert from "@/components/ui/FormAlert";
import SubmitButton from "@/components/ui/SubmitButton";

const initialState: SuperAdminFormState = {};

// El repartidor favorito de un negocio con precio "Del repartidor" (ENVIO-229): lo fija el equipo de SMA a la Carta
// entre los repartidores activos con al menos una zona propia activa. No hace falta que cubra zonas comunes. El local
// lo ve en solo lectura.
export default function FavoriteCourierForm({
  businessId,
  candidates,
  current,
}: {
  businessId: string;
  candidates: { id: string; name: string; zones: number }[];
  current: string | null;
}) {
  const [state, formAction] = useActionState(setFavoriteCourierAction, initialState);

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}
      {state.message ? <FormAlert tone="success">{state.message}</FormAlert> : null}

      <input type="hidden" name="businessId" value={businessId} />

      <div>
        <label htmlFor="favorito-negocio" className="mb-1.5 block text-sm font-medium text-stone-900">
          Repartidor favorito
        </label>
        <select
          id="favorito-negocio"
          name="courierId"
          defaultValue={candidates.some((courier) => courier.id === current) ? (current ?? "") : ""}
          className="w-full rounded-xl border border-line-strong bg-white px-4 py-3 text-base text-stone-900 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          <option value="">Sin elegir</option>
          {candidates.map((courier) => (
            <option key={courier.id} value={courier.id}>
              {courier.name} ({courier.zones === 1 ? "1 zona propia" : `${courier.zones} zonas propias`})
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-sm text-stone-500">
          {candidates.length === 0
            ? "Ningún repartidor activo tiene zonas propias todavía. Cargalas en el detalle del repartidor."
            : "Solo aparecen los repartidores activos con zonas propias. Sus zonas y precios son los que ve el cliente, y él recibe los pedidos."}
        </p>
      </div>

      <SubmitButton pendingLabel="Guardando…">Guardar favorito</SubmitButton>
    </form>
  );
}
