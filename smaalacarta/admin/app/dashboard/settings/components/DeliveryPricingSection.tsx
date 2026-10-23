"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { saveZonePricesAction } from "../actions";
import Section from "@/components/ui/Section";
import type { BusinessDeliveryPricing } from "@/lib/db/delivery-pricing";
import { formatMoney } from "@/lib/promotions/pricing";

// Precios del envío (ENVIO-220 y 227). Según el tipo que le puso el superadmin al negocio:
// - "Del negocio" con permiso: el precio de cada zona tildada (vacío = el precio común).
// - "Del negocio" sin permiso: los precios los carga el equipo de SMA a la Carta; se ven en solo lectura.
// - "Del repartidor": las zonas del repartidor favorito, en solo lectura; los precios los pone el repartidor.
// Con el tipo "Común" no hay nada para decidir y la sección no aparece. Se guarda con su propio botón.
export default function DeliveryPricingSection({ pricing }: { pricing: BusinessDeliveryPricing }) {
  if (pricing.pricing === "common") return null;

  if (pricing.pricing === "courier") {
    return (
      <Section
        id="precios-envio"
        title="Precios del envío"
        description={
          pricing.courier
            ? `Los precios los pone ${pricing.courier.name}, tu repartidor. Tus clientes ven estas zonas al pedir un envío.`
            : "Los precios los pone el repartidor."
        }
      >
        {pricing.courier_zones.filter((zone) => zone.active).length === 0 ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Todavía no hay zonas del repartidor: tus clientes no ven el envío.
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {pricing.courier_zones
              .filter((zone) => zone.active)
              .map((zone) => (
                <li key={zone.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="truncate text-stone-900">{zone.name}</span>
                  <span className="text-sm text-stone-700">{formatMoney(zone.price)}</span>
                </li>
              ))}
          </ul>
        )}
      </Section>
    );
  }

  return <BusinessPrices pricing={pricing} />;
}

function BusinessPrices({ pricing }: { pricing: BusinessDeliveryPricing }) {
  const router = useRouter();

  const initial = (zone: BusinessDeliveryPricing["zones"][number]) =>
    zone.business_price === null ? "" : String(zone.business_price).replace(".", ",");

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(pricing.zones.map((zone) => [zone.id, initial(zone)])),
  );
  const [seen, setSeen] = useState(pricing);
  if (seen !== pricing) {
    setSeen(pricing);
    setValues(Object.fromEntries(pricing.zones.map((zone) => [zone.id, initial(zone)])));
  }

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function save() {
    setError(null);
    setSaved(false);
    setFieldErrors({});
    setBusy(true);

    try {
      const result = await saveZonePricesAction(
        pricing.zones.map((zone) => ({ zoneId: zone.id, price: values[zone.id] ?? "" })),
      );

      if (result.ok) {
        setSaved(true);
      } else {
        setError(result.error);
        setFieldErrors((result.fieldErrors ?? {}) as Record<string, string>);
      }
    } catch {
      setError("No pudimos guardar los cambios. Probá de nuevo.");
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <Section
      id="precios-envio"
      title="Precios del envío"
      description={
        pricing.editable
          ? "El precio de cada zona a la que enviás. Si dejás uno vacío, se usa el precio común."
          : "Los precios de tus zonas los carga el equipo de SMA a la Carta. Si querés cambiar alguno, pedíselo."
      }
    >
      {pricing.zones.length === 0 ? (
        <p className="text-sm text-stone-400">Todavía no elegiste zonas de envío.</p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line">
          {pricing.zones.map((zone) => (
            <li key={zone.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0 flex-1 truncate text-stone-900">{zone.name}</span>

              {pricing.editable ? (
                <label className="text-sm text-stone-600">
                  <span className="sr-only">Precio de {zone.name}</span>
                  <input
                    value={values[zone.id] ?? ""}
                    onChange={(event) => setValues((current) => ({ ...current, [zone.id]: event.target.value }))}
                    inputMode="decimal"
                    placeholder={String(zone.common_price)}
                    aria-invalid={fieldErrors[zone.id] ? true : undefined}
                    className="w-32 rounded-lg border border-line-strong px-3 py-2 text-right text-sm"
                  />
                  {fieldErrors[zone.id] ? (
                    <span className="mt-1 block text-xs text-red-700">{fieldErrors[zone.id]}</span>
                  ) : null}
                </label>
              ) : (
                <span className="text-sm text-stone-700">
                  {formatMoney(zone.business_price ?? zone.common_price)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {pricing.editable && pricing.zones.length > 0 ? (
        <div className="space-y-3">
          {error ? (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </p>
          ) : null}
          {saved ? (
            <p role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              Precios guardados.
            </p>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="min-h-11 rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60"
          >
            {busy ? "Guardando…" : "Guardar precios"}
          </button>
        </div>
      ) : null}
    </Section>
  );
}
