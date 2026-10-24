"use client";

import Link from "next/link";
import { useActionState } from "react";

import { createCourierAction } from "../actions";
import CourierTypeFields from "./CourierTypeFields";
import CredentialsCard from "../../components/CredentialsCard";
import type { SuperAdminFormState } from "../../actions";
import Field from "@/components/ui/Field";
import FormAlert from "@/components/ui/FormAlert";
import SubmitButton from "@/components/ui/SubmitButton";
import type { BusinessChoice } from "@/lib/db/couriers";

const initialState: SuperAdminFormState = {};

export default function NewCourierForm({ businesses }: { businesses: BusinessChoice[] }) {
  const [state, formAction] = useActionState(createCourierAction, initialState);

  // Repartidor creado: se muestran los datos de acceso, que no se vuelven a ver.
  if (state.courierId && state.credentials) {
    return (
      <div className="space-y-5">
        <FormAlert tone="success">Repartidor creado.</FormAlert>
        {state.message ? <FormAlert tone="error">{state.message}</FormAlert> : null}

        <p className="text-sm text-stone-600">Creamos su cuenta. Pasale estos datos:</p>
        <CredentialsCard credentials={state.credentials} />

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/superadmin/repartidores/${state.courierId}`}
            className="inline-block rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-hover"
          >
            Ver el repartidor
          </Link>
          <Link
            href="/superadmin/repartidores"
            className="inline-block rounded-xl border border-line-strong px-5 py-3 text-sm font-semibold text-brand transition hover:bg-brand-soft"
          >
            Todos los repartidores
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate className="space-y-5">
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}

      <Field
        label="Nombre"
        name="name"
        defaultValue={state.values?.name}
        error={state.fieldErrors?.name}
        autoComplete="off"
        placeholder="Moto Express"
        required
      />

      <Field
        label="WhatsApp"
        name="whatsapp"
        inputMode="tel"
        defaultValue={state.values?.whatsapp}
        hint="Con el código de área, por ejemplo 3510000000. Lo ven los clientes del local."
        error={state.fieldErrors?.whatsapp}
        required
      />

      <Field
        label="Email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="off"
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
        hint="Es su usuario para entrar. No se le envía ningún mail."
        placeholder="repartidor@correo.com"
        required
      />

      <CourierTypeFields
        businesses={businesses}
        defaultType={state.values?.courierType === "own" ? "own" : "free"}
        defaultBusinessId={state.values?.ownBusinessId || null}
        error={state.fieldErrors?.ownBusinessId}
      />

      <SubmitButton pendingLabel="Creando repartidor…">Crear repartidor</SubmitButton>
    </form>
  );
}
