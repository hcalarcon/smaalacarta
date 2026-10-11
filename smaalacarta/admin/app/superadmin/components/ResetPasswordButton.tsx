"use client";

import { useActionState } from "react";

import CredentialsCard from "./CredentialsCard";
import { resetPasswordAction, type SuperAdminFormState } from "../actions";
import { resetCourierPasswordAction } from "../repartidores/actions";
import FormAlert from "@/components/ui/FormAlert";

const initialState: SuperAdminFormState = {};

// Restablece la contraseña de una cuenta: la de un miembro de un negocio (`businessId` + `userId`) o
// la de un repartidor (`courierId`). La acción comprueba superadmin y que la cuenta sea de ese
// negocio o de ese repartidor.
export default function ResetPasswordButton({
  businessId,
  userId,
  courierId,
  label,
}: {
  businessId?: string;
  userId?: string;
  courierId?: string;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(
    courierId ? resetCourierPasswordAction : resetPasswordAction,
    initialState,
  );

  return (
    <div>
      <form
        action={formAction}
        onSubmit={(event) => {
          if (
            !window.confirm(
              `¿Restablecer la contraseña de ${label}? Va a dejar de funcionar la actual y se genera una temporal nueva.`,
            )
          ) {
            event.preventDefault();
          }
        }}
      >
        {courierId ? (
          <input type="hidden" name="courierId" value={courierId} />
        ) : (
          <>
            <input type="hidden" name="businessId" value={businessId ?? ""} />
            <input type="hidden" name="userId" value={userId ?? ""} />
          </>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-brand transition hover:bg-brand-soft disabled:opacity-50"
        >
          {pending ? "Restableciendo…" : "Restablecer contraseña"}
        </button>
      </form>

      {state.error ? (
        <div className="mt-2">
          <FormAlert tone="error">{state.error}</FormAlert>
        </div>
      ) : null}

      {state.credentials ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-stone-600">{state.message}</p>
          <CredentialsCard credentials={state.credentials} />
        </div>
      ) : null}
    </div>
  );
}
