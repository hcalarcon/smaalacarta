"use client";

import { useActionState, useState } from "react";

import { createBusinessAction, type SuperAdminFormState } from "../actions";
import Field from "@/components/ui/Field";
import FormAlert from "@/components/ui/FormAlert";
import SubmitButton from "@/components/ui/SubmitButton";
import { slugify } from "@/lib/superadmin/validation";

const initialState: SuperAdminFormState = {};

export default function NewBusinessForm() {
  const [state, formAction] = useActionState(createBusinessAction, initialState);

  const [name, setName] = useState(state.values?.name ?? "");
  const [slug, setSlug] = useState(state.values?.slug ?? "");
  // Mientras nadie edite el slug a mano, sigue al nombre.
  const [slugEdited, setSlugEdited] = useState(false);

  return (
    <form action={formAction} noValidate className="space-y-5">
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}

      <Field
        label="Nombre del negocio"
        name="name"
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          if (!slugEdited) setSlug(slugify(event.target.value));
        }}
        error={state.fieldErrors?.name}
        placeholder="Panadería Don José"
        required
      />

      <Field
        label="Slug"
        name="slug"
        value={slug}
        onChange={(event) => {
          setSlug(event.target.value);
          setSlugEdited(true);
        }}
        hint="Va en la dirección del menú: minúsculas, números y guiones."
        error={state.fieldErrors?.slug}
        autoCapitalize="none"
        required
      />

      <Field
        label="WhatsApp (opcional)"
        name="whatsapp"
        inputMode="tel"
        defaultValue={state.values?.whatsapp}
        hint="Con código de país, por ejemplo 5493510000000."
        error={state.fieldErrors?.whatsapp}
      />

      <hr className="border-line" />

      <Field
        label="Nombre del dueño (opcional)"
        name="ownerName"
        autoComplete="off"
        defaultValue={state.values?.ownerName}
        placeholder="Ana Pérez"
      />

      <Field
        label="Email del dueño"
        name="ownerEmail"
        type="email"
        inputMode="email"
        autoComplete="off"
        defaultValue={state.values?.ownerEmail}
        error={state.fieldErrors?.ownerEmail}
        placeholder="dueno@negocio.com"
        required
      />

      <SubmitButton pendingLabel="Creando negocio…">Crear negocio</SubmitButton>
    </form>
  );
}
