"use client";

import { useActionState } from "react";

import { updatePlanAction, type SuperAdminFormState } from "../actions";
import FormAlert from "@/components/ui/FormAlert";
import SubmitButton from "@/components/ui/SubmitButton";

const initialState: SuperAdminFormState = {};

export default function PlanForm({
  businessId,
  planPdf,
  planWeb,
  planCompleto,
  active,
}: {
  businessId: string;
  planPdf: boolean;
  planWeb: boolean;
  planCompleto: boolean;
  active: boolean;
}) {
  const [state, formAction] = useActionState(updatePlanAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}
      {state.message ? (
        <FormAlert tone="success">{state.message}</FormAlert>
      ) : null}

      <input type="hidden" name="businessId" value={businessId} />

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="planPdf" defaultChecked={planPdf} />
          QR + PDF
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="planWeb" defaultChecked={planWeb} />
          Menú Web
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="planCompleto"
            defaultChecked={planCompleto}
          />
          Subdominio Completo
        </label>
      </div>

      <hr className="border-line" />

      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" name="active" defaultChecked={active} />
        Negocio activo (según pago)
      </label>
      <p className="text-sm text-stone-500">
        Si lo desmarcás, el negocio deja de mostrarse en los tres servicios
        públicos, sin borrar nada.
      </p>

      <SubmitButton pendingLabel="Guardando…">Guardar</SubmitButton>
    </form>
  );
}
