"use client";

import { useActionState } from "react";

import { updateCourierDeliveryAction, type SuperAdminFormState } from "../actions";
import FormAlert from "@/components/ui/FormAlert";
import SubmitButton from "@/components/ui/SubmitButton";

const initialState: SuperAdminFormState = {};

// El envío con Repartos al Toque lo habilita solo el equipo de SMA a la Carta (ENVIO-2 y 18).
export default function CourierDeliveryForm({
  businessId,
  courierDelivery,
}: {
  businessId: string;
  courierDelivery: boolean;
}) {
  const [state, formAction] = useActionState(updateCourierDeliveryAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}
      {state.message ? <FormAlert tone="success">{state.message}</FormAlert> : null}

      <input type="hidden" name="businessId" value={businessId} />

      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" name="courierDelivery" defaultChecked={courierDelivery} />
        Envío con Repartos al Toque
      </label>
      <p className="text-sm text-stone-500">
        Si lo marcás, el menú de este negocio ofrece elegir el barrio al pedir con entrega a domicilio
        y el panel gestiona el envío con el repartidor.
      </p>

      <SubmitButton pendingLabel="Guardando…">Guardar</SubmitButton>
    </form>
  );
}
