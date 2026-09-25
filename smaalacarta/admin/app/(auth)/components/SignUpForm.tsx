"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signUpAction, type AuthFormState } from "../actions";
import Field from "@/components/ui/Field";
import FormAlert from "@/components/ui/FormAlert";
import SubmitButton from "@/components/ui/SubmitButton";

const initialState: AuthFormState = {};

export default function SignUpForm() {
  const [state, formAction] = useActionState(signUpAction, initialState);

  if (state.message) {
    return (
      <div className="space-y-5">
        <FormAlert tone="success">{state.message}</FormAlert>

        <p className="text-sm text-stone-600">
          ¿No te llegó? Revisá la carpeta de spam o{" "}
          <Link
            href="/login"
            className="font-medium text-accent hover:text-accent-hover"
          >
            volvé a iniciar sesión
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate className="space-y-5">
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}

      <Field
        label="Nombre y apellido"
        name="full_name"
        autoComplete="name"
        placeholder="Ana Pérez"
      />

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

      <Field
        label="Contraseña"
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

      <SubmitButton pendingLabel="Creando cuenta…">Crear cuenta</SubmitButton>

      <p className="text-center text-sm text-stone-600">
        ¿Ya tenés cuenta?{" "}
        <Link
          href="/login"
          className="font-medium text-accent hover:text-accent-hover"
        >
          Iniciá sesión
        </Link>
      </p>
    </form>
  );
}
