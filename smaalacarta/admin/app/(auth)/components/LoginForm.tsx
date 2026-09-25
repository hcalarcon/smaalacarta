"use client";

import Link from "next/link";
import { useActionState } from "react";

import { loginAction, type AuthFormState } from "../actions";
import Field from "@/components/ui/Field";
import FormAlert from "@/components/ui/FormAlert";
import SubmitButton from "@/components/ui/SubmitButton";

const initialState: AuthFormState = {};

export default function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} noValidate className="space-y-5">
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}

      {next ? <input type="hidden" name="next" value={next} /> : null}

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
        autoComplete="current-password"
        error={state.fieldErrors?.password}
        required
      />

      <div className="text-right">
        <Link
          href="/recuperar"
          className="text-sm font-medium text-accent hover:text-accent-hover"
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </div>

      <SubmitButton pendingLabel="Ingresando…">Ingresar</SubmitButton>

      <p className="text-center text-sm text-stone-500">
        Las cuentas las crea el equipo de SMA a la Carta. Si todavía no tenés
        una, pedísela a quien te dio de alta.
      </p>
    </form>
  );
}
