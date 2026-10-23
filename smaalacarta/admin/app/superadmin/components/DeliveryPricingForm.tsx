"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { updateDeliveryPricingAction, type SuperAdminFormState } from "../actions";
import FormAlert from "@/components/ui/FormAlert";
import SubmitButton from "@/components/ui/SubmitButton";
import type { BusinessDeliveryPricing } from "@/lib/db/delivery-pricing";
import {
  DELIVERY_PRICING,
  DELIVERY_PRICING_HELP,
  DELIVERY_PRICING_LABELS,
  type DeliveryPricing,
} from "@/lib/delivery-pricing";

const initialState: SuperAdminFormState = {};

// Tipo de precio del envío del negocio y sus dos permisos (ENVIO-219 y 227). Solo lo cambia el equipo de SMA a la
// Carta; el local ve el resultado en Configuración → Envíos.
export default function DeliveryPricingForm({
  businessId,
  pricing,
}: {
  businessId: string;
  pricing: BusinessDeliveryPricing;
}) {
  const [state, formAction] = useActionState(updateDeliveryPricingAction, initialState);
  const [type, setType] = useState<DeliveryPricing>(pricing.pricing);

  const courier = pricing.courier;

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}
      {state.message ? <FormAlert tone="success">{state.message}</FormAlert> : null}

      <input type="hidden" name="businessId" value={businessId} />

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-stone-900">Tipo de precio</legend>
        {DELIVERY_PRICING.map((option) => (
          <label key={option} className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="pricing"
              value={option}
              checked={type === option}
              onChange={() => setType(option)}
              className="mt-1"
            />
            <span>
              <span className="font-medium">{DELIVERY_PRICING_LABELS[option]}</span>
              <span className="block text-stone-500">{DELIVERY_PRICING_HELP[option]}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {type === "courier" ? (
        <div className="rounded-2xl border border-line bg-cream px-4 py-3 text-sm text-stone-700">
          {courier ? (
            <>
              <p>
                Repartidor favorito: <strong>{courier.name}</strong>
                {courier.active ? "" : " (inactivo)"}
              </p>
              <p className="mt-1">
                Zonas propias cargadas: <strong>{courier.zones}</strong>
                {courier.zones === 0 ? " — el menú no ofrece envío hasta que tenga alguna activa" : ""}.{" "}
                <Link
                  href={`/superadmin/repartidores/${courier.id}`}
                  className="font-medium text-accent hover:text-accent-hover"
                >
                  Editar sus zonas
                </Link>
              </p>
            </>
          ) : (
            <p>Este negocio no tiene un repartidor favorito activo: no ofrece envío con este tipo de precio.</p>
          )}
        </div>
      ) : null}

      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" name="pricesEditable" defaultChecked={pricing.editable} />
        El negocio puede editar sus precios de envío
      </label>
      <p className="-mt-3 text-sm text-stone-500">
        Solo vale con el tipo &ldquo;Del negocio&rdquo;. Sin el permiso, los precios los cargás vos.
      </p>

      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" name="offersEnabled" defaultChecked={pricing.offers_enabled} />
        Los repartidores pueden ofertar otro precio
      </label>
      <p className="-mt-3 text-sm text-stone-500">
        Prendido, el cliente ve &ldquo;Envío aprox.&rdquo; y el repartidor puede ofertar otro precio con un motivo.
        Apagado, el precio es fijo: solo el de la zona.
      </p>

      <SubmitButton pendingLabel="Guardando…">Guardar</SubmitButton>
    </form>
  );
}
