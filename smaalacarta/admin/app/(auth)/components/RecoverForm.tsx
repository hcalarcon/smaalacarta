"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  requestPasswordResetAction,
  type AuthFormState,
} from "../actions";
import Field from "@/components/ui/Field";
import FormAlert from "@/components/ui/FormAlert";
import SubmitButton from "@/components/ui/SubmitButton";

const initialState: AuthFormState = {};

export default function RecoverForm() {
  const [state, formAction] = useActionState(
    requestPasswordResetAction,
    initialState,
  );

  return (
    <form action={formAction} noValidate className="space-y-5">
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}
      {state.message ? (
        <FormAlert tone="success">{state.message}</FormAlert>
      ) : null}

      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="vos@tunegocio.com"
        defaultValue={state.email}
        error={state.fieldErrors?.email}
        required
      />

      <SubmitButton pendingLabel="Enviando…">Enviar link</SubmitButton>

      <p className="text-center text-sm text-stone-600">
        <Link
          href="/login"
          className="font-medium text-accent hover:text-accent-hover"
        >
          Volver a iniciar sesión
        </Link>
      </p>
    </form>
  );
}
