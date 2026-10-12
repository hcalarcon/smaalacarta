"use client";

import { useActionState } from "react";

import { updateCourierDeliveryAction, type SuperAdminFormState } from "../actions";
import FormAlert from "@/components/ui/FormAlert";
import SubmitButton from "@/components/ui/SubmitButton";
import { zonesLabel } from "@/lib/courier/zones-label";

const initialState: SuperAdminFormState = {};

// El envío con repartidores lo habilita solo el equipo de SMA a la Carta (ENVIO-2 y 18).
export default function CourierDeliveryForm({
  businessId,
  courierDelivery,
  zoneCount,
}: {
  businessId: string;
  courierDelivery: boolean;
  // Zonas que el local tiene tildadas; nulo si el envío no está habilitado (ENVIO-136).
  zoneCount: number | null;
}) {
  const [state, formAction] = useActionState(updateCourierDeliveryAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}
      {state.message ? <FormAlert tone="success">{state.message}</FormAlert> : null}

      <input type="hidden" name="businessId" value={businessId} />

      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" name="courierDelivery" defaultChecked={courierDelivery} />
        Envío con repartidores
      </label>
      <p className="text-sm text-stone-500">
        Si lo marcás, el menú de este negocio ofrece elegir el barrio al pedir con entrega a domicilio
        y el panel gestiona el envío con el repartidor.
      </p>

      {zoneCount !== null ? (
        <p className="text-sm text-stone-700">
          Zonas a las que envía: <strong>{zonesLabel(zoneCount)}</strong>
          {zoneCount === 0 ? " (el menú no ofrece envío hasta que tilde alguna)" : ""}
        </p>
      ) : null}

      <SubmitButton pendingLabel="Guardando…">Guardar</SubmitButton>
    </form>
  );
}
