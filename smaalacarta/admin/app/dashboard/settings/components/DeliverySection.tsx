"use client";

import { useEffect, useState } from "react";

import { useSettingsSave } from "./SettingsSaveProvider";
import Field from "@/components/ui/Field";
import Section from "@/components/ui/Section";
import {
  FAVORITE_MINUTES_MAX,
  FAVORITE_MINUTES_MIN,
  favoriteCandidates,
  initialDeliveryInput,
  normalizeDeliveryInput,
  validateDeliveryInput,
  type DeliveryInput,
  type DeliveryOptions,
} from "@/lib/courier/preferences";
import { formatMoney } from "@/lib/promotions/pricing";

// Envíos (ENVIO-58): a qué zonas envía el local, repartidor favorito y cuántos minutos lo ve solo él.
// No tiene botón propio: informa a `SettingsSaveProvider` y se guarda con "Guardar cambios", junto al
// resto de Configuración (zonas y favorito van juntos y de forma atómica).
export default function DeliverySection({ options }: { options: DeliveryOptions }) {
  const { reportDelivery, deliveryErrors } = useSettingsSave();

  const [input, setInput] = useState<DeliveryInput>(() => initialDeliveryInput(options));

  // Si la pantalla se refresca con datos nuevos (después de guardar), se vuelve a leer de ahí.
  const [seen, setSeen] = useState(options);
  if (seen !== options) {
    setSeen(options);
    setInput(initialDeliveryInput(options));
  }

  const validation = validateDeliveryInput(input, options);
  const errors = validation.ok ? {} : validation.errors;
  const errorsKey = JSON.stringify(errors);

  useEffect(() => {
    reportDelivery({ input, errors: JSON.parse(errorsKey) });
    // reportDelivery cambia en cada render del proveedor; lo que importa es lo que se edita.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, errorsKey]);

  const candidates = favoriteCandidates(options, input.zoneIds);
  const marked = new Set(input.zoneIds);

  function toggleZone(id: string, checked: boolean) {
    const next = checked ? [...input.zoneIds, id] : input.zoneIds.filter((zoneId) => zoneId !== id);
    // Si el favorito deja de cubrir las zonas marcadas, vuelve a "Sin favorito".
    setInput((current) => normalizeDeliveryInput({ ...current, zoneIds: next }, options));
  }

  return (
    <Section
      id="envios"
      title="Envíos"
      description="A qué zonas enviás y qué repartidor atiende primero tus pedidos."
    >
      <fieldset>
        <legend className="mb-1.5 block text-sm font-medium text-brand">Zonas a las que enviás</legend>
        <p className="mb-2 text-sm text-stone-500">
          Tus clientes solo ven estas zonas al pedir un envío. El precio es de referencia: el repartidor puede
          ajustarlo, con un motivo, al aceptar el pedido.
        </p>

        {options.zones.length === 0 ? (
          <p className="text-sm text-stone-400">Todavía no hay zonas cargadas.</p>
        ) : (
          <ul className="grid gap-x-6 sm:grid-cols-2">
            {options.zones.map((zone) => (
              <li key={zone.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 py-1.5">
                  <input
                    type="checkbox"
                    checked={marked.has(zone.id)}
                    onChange={(event) => toggleZone(zone.id, event.target.checked)}
                    className="h-5 w-5"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-stone-900">{zone.name}</span>
                    {!zone.covered ? (
                      <span className="block text-xs text-amber-700">Sin repartidor por ahora</span>
                    ) : null}
                  </span>
                  <span className="text-sm text-stone-600">{formatMoney(zone.price)}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <div>
        <label htmlFor="envios-favorito" className="mb-1.5 block text-sm font-medium text-brand">
          Repartidor favorito
        </label>
        <select
          id="envios-favorito"
          value={input.favoriteId ?? ""}
          onChange={(event) => setInput({ ...input, favoriteId: event.target.value || null })}
          className="w-full rounded-xl border border-line-strong bg-white px-4 py-3 text-base text-stone-900 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          <option value="">Sin favorito (el pedido va a todos)</option>
          {candidates.map((courier) => (
            <option key={courier.id} value={courier.id}>
              {courier.name}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-sm text-stone-500">
          {candidates.length === 0
            ? "Marcá al menos una zona que cubra algún repartidor para poder elegir un favorito."
            : "Solo aparecen los repartidores que cubren alguna de las zonas marcadas."}
        </p>
        {deliveryErrors.favorite ? <p className="mt-1.5 text-sm text-red-600">{deliveryErrors.favorite}</p> : null}
      </div>

      {input.favoriteId !== null ? (
        <Field
          label="Minutos para el favorito"
          name="favorite-minutes"
          type="number"
          inputMode="numeric"
          min={FAVORITE_MINUTES_MIN}
          max={FAVORITE_MINUTES_MAX}
          value={input.minutes}
          onChange={(event) => setInput({ ...input, minutes: event.target.value })}
          hint="Cuánto tiempo lo ve solo tu favorito antes de que pase a los demás repartidores."
          error={deliveryErrors.minutes}
        />
      ) : null}
    </Section>
  );
}
