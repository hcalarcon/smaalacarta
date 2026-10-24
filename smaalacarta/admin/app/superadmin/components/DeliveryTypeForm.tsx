"use client";

import Link from "next/link";
import { useActionState } from "react";

import { updateDeliveryTypeAction, type SuperAdminFormState } from "../actions";
import FormAlert from "@/components/ui/FormAlert";
import SubmitButton from "@/components/ui/SubmitButton";
import type { OwnDelivery } from "@/lib/db/own-delivery";

const initialState: SuperAdminFormState = {};

// Envío libre o propio del negocio (ENVIO-245 y 259). Solo lo cambia el equipo de SMA a la Carta; el local ve el
// resultado en Configuración → Envíos. El repartidor propio se asigna en el detalle del repartidor.
export default function DeliveryTypeForm({ businessId, delivery }: { businessId: string; delivery: OwnDelivery }) {
  const [state, formAction] = useActionState(updateDeliveryTypeAction, initialState);

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}
      {state.message ? <FormAlert tone="success">{state.message}</FormAlert> : null}

      <input type="hidden" name="businessId" value={businessId} />

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-stone-900">Tipo de envío</legend>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="deliveryType"
            value="free"
            defaultChecked={delivery.delivery_type === "free"}
            className="mt-1"
          />
          <span>
            <span className="font-medium">Libre</span>
            <span className="block text-stone-500">
              Zonas comunes, repartidores libres y ofertas. Es el envío de siempre.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="deliveryType"
            value="own"
            defaultChecked={delivery.delivery_type === "own"}
            className="mt-1"
          />
          <span>
            <span className="font-medium">Propio</span>
            <span className="block text-stone-500">
              Las zonas y los precios los carga el negocio, y el pedido va directo a su repartidor propio, sin ofertas.
            </span>
          </span>
        </label>
      </fieldset>

      {delivery.delivery_type === "own" ? (
        <div className="space-y-1 rounded-2xl border border-line bg-cream px-4 py-3 text-sm text-stone-700">
          {delivery.courier ? (
            <p>
              Repartidor propio:{" "}
              <Link
                href={`/superadmin/repartidores/${delivery.courier.id}`}
                className="font-medium text-accent hover:text-accent-hover"
              >
                {delivery.courier.name}
              </Link>
              {delivery.courier.active ? "" : " (inactivo: los envíos los lleva el local)"}
            </p>
          ) : (
            <p>
              Todavía no tiene repartidor propio: los envíos los lleva el local. Asignalo desde el alta o el detalle de
              un repartidor.
            </p>
          )}
          <p>
            Zonas con precio cargadas: <strong>{delivery.zones_with_price}</strong>
            {delivery.zones_with_price === 0 ? " — el menú ofrece el envío a coordinar con el local" : ""}.
          </p>
        </div>
      ) : null}

      <SubmitButton pendingLabel="Guardando…">Guardar</SubmitButton>
    </form>
  );
}
