"use client";

import { useState } from "react";

import type { BusinessChoice } from "@/lib/db/couriers";

// Libre o propio de un negocio (ENVIO-246 y 258). Libre cubre zonas comunes y entra en las ofertas de cualquier negocio;
// propio sirve a un solo negocio, con las zonas de ese negocio, y no entra en la puja de los demás. Los negocios que ya
// tienen otro repartidor propio activo se marcan: la base rechaza un segundo.
export default function CourierTypeFields({
  businesses,
  courierId,
  defaultType,
  defaultBusinessId,
  error,
}: {
  businesses: BusinessChoice[];
  // El repartidor que se edita: su propio negocio no cuenta como ocupado.
  courierId?: string;
  defaultType: "free" | "own";
  defaultBusinessId: string | null;
  error?: string;
}) {
  const [type, setType] = useState(defaultType);

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium text-stone-900">Tipo de repartidor</legend>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="radio"
          name="courierType"
          value="free"
          checked={type === "free"}
          onChange={() => setType("free")}
          className="mt-1"
        />
        <span>
          <span className="font-medium">Libre</span>
          <span className="block text-stone-500">Cubre zonas comunes y entra en las ofertas de cualquier negocio.</span>
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="radio"
          name="courierType"
          value="own"
          checked={type === "own"}
          onChange={() => setType("own")}
          className="mt-1"
        />
        <span>
          <span className="font-medium">Propio de un negocio</span>
          <span className="block text-stone-500">
            Solo ve y recibe los pedidos de ese negocio, con las zonas del negocio. No entra en la puja de los demás.
          </span>
        </span>
      </label>

      {type === "own" ? (
        <div>
          <label htmlFor="ownBusinessId" className="mb-1.5 block text-sm font-medium text-stone-900">
            Negocio
          </label>
          <select
            id="ownBusinessId"
            name="ownBusinessId"
            defaultValue={defaultBusinessId ?? ""}
            aria-invalid={error ? true : undefined}
            className="w-full rounded-xl border border-line-strong bg-white px-4 py-3 text-base text-stone-900 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            <option value="">Elegí un negocio</option>
            {businesses.map((business) => {
              const taken = business.ownCourier && business.ownCourier.id !== courierId;

              return (
                <option key={business.id} value={business.id}>
                  {business.name} ({business.slug})
                  {taken ? ` — ya tiene a ${business.ownCourier!.name}` : ""}
                  {business.deliveryType === "free" ? " — envío libre" : ""}
                </option>
              );
            })}
          </select>
          <p className="mt-1.5 text-sm text-stone-500">
            Para que se use, el negocio tiene que tener el envío propio (se cambia en el detalle del negocio).
          </p>
          {error ? <p className="mt-1.5 text-sm text-red-600">{error}</p> : null}
        </div>
      ) : null}
    </fieldset>
  );
}
