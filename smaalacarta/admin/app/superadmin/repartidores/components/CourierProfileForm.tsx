"use client";

import { useActionState } from "react";

import { updateCourierAction } from "../actions";
import type { SuperAdminFormState } from "../../actions";
import CourierTypeFields from "./CourierTypeFields";
import Field from "@/components/ui/Field";
import FormAlert from "@/components/ui/FormAlert";
import SubmitButton from "@/components/ui/SubmitButton";
import type { BusinessChoice } from "@/lib/db/couriers";

const initialState: SuperAdminFormState = {};

// Nombre, WhatsApp y si está activo. Un repartidor inactivo deja de recibir pedidos y de aparecer en
// el menú de los locales, pero conserva sus zonas y sus pedidos.
export default function CourierProfileForm({
  courierId,
  name,
  whatsapp,
  active,
  courierType,
  ownBusinessId,
  businesses,
}: {
  courierId: string;
  name: string;
  whatsapp: string;
  active: boolean;
  courierType: "free" | "own";
  ownBusinessId: string | null;
  businesses: BusinessChoice[];
}) {
  const [state, formAction] = useActionState(updateCourierAction, initialState);

  return (
    <form action={formAction} noValidate className="space-y-5">
      <input type="hidden" name="courierId" value={courierId} />

      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}
      {state.message ? <FormAlert tone="success">{state.message}</FormAlert> : null}

      <Field
        label="Nombre"
        name="name"
        defaultValue={state.values?.name ?? name}
        error={state.fieldErrors?.name}
        autoComplete="off"
        required
      />

      <Field
        label="WhatsApp"
        name="whatsapp"
        inputMode="tel"
        defaultValue={state.values?.whatsapp ?? whatsapp}
        hint="Con el código de área. Lo ven los clientes del local."
        error={state.fieldErrors?.whatsapp}
        required
      />

      <CourierTypeFields
        businesses={businesses}
        courierId={courierId}
        defaultType={courierType}
        defaultBusinessId={ownBusinessId}
        error={state.fieldErrors?.ownBusinessId}
      />

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={active} />
        Activo
      </label>

      <SubmitButton pendingLabel="Guardando…">Guardar cambios</SubmitButton>
    </form>
  );
}
