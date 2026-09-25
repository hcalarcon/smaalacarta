"use client";

import { useActionState } from "react";

import { updatePasswordAction, type AuthFormState } from "../actions";
import Field from "@/components/ui/Field";
import FormAlert from "@/components/ui/FormAlert";
import SubmitButton from "@/components/ui/SubmitButton";

const initialState: AuthFormState = {};

export default function ResetPasswordForm() {
  const [state, formAction] = useActionState(
    updatePasswordAction,
    initialState,
  );

  return (
    <form action={formAction} noValidate className="space-y-5">
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}

      <Field
        label="Contraseña nueva"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="Al menos 8 caracteres."
        error={state.fieldErrors?.password}
        required
      />

      <Field
        label="Repetí la contraseña"
        name="confirm"
        type="password"
        autoComplete="new-password"
        error={state.fieldErrors?.confirm}
        required
      />

      <SubmitButton pendingLabel="Guardando…">Guardar contraseña</SubmitButton>
    </form>
  );
}
