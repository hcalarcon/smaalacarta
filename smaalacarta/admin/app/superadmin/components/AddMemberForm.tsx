"use client";

import { useActionState } from "react";

import CredentialsCard from "./CredentialsCard";
import { addMemberAction, type SuperAdminFormState } from "../actions";
import Field from "@/components/ui/Field";
import FormAlert from "@/components/ui/FormAlert";
import SubmitButton from "@/components/ui/SubmitButton";
import { MEMBER_ROLES } from "@/lib/superadmin/validation";

const initialState: SuperAdminFormState = {};

const ROLE_LABELS: Record<(typeof MEMBER_ROLES)[number], string> = {
  owner: "Dueño",
  staff: "Equipo",
};

export default function AddMemberForm({ businessId }: { businessId: string }) {
  const [state, formAction] = useActionState(addMemberAction, initialState);

  return (
    <form action={formAction} noValidate className="space-y-4">
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}
      {state.message ? (
        <FormAlert tone="success">{state.message}</FormAlert>
      ) : null}
      {state.credentials ? (
        <CredentialsCard credentials={state.credentials} />
      ) : null}

      <input type="hidden" name="businessId" value={businessId} />

      <Field
        label="Email de la cuenta"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="off"
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
        hint="Si no tiene cuenta, se la creamos con una contraseña temporal."
        required
      />

      <div>
        <label
          htmlFor="member-role"
          className="mb-1.5 block text-sm font-medium text-brand"
        >
          Rol
        </label>
        <select
          id="member-role"
          name="role"
          defaultValue={state.values?.role ?? "staff"}
          className="w-full rounded-xl border border-line-strong bg-white px-4 py-3 text-base text-stone-900 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          {MEMBER_ROLES.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
        {state.fieldErrors?.role ? (
          <p className="mt-1.5 text-sm text-red-600">{state.fieldErrors.role}</p>
        ) : null}
      </div>

      <SubmitButton pendingLabel="Asignando…">Asignar al negocio</SubmitButton>
    </form>
  );
}
