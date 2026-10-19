import { formatClock } from "@/lib/orders/prep";

type AvailableCourier = { id: string; name: string; since: string; zones: string[] };

// Los repartidores disponibles ahora, con desde qué hora y qué zonas cubren (ENVIO-201). Solo se muestra con el
// interruptor "Disponibilidad de repartidores" prendido.
export default function AvailableNow({ couriers }: { couriers: AvailableCourier[] }) {
  return (
    <section aria-labelledby="available-now-title" className="rounded-3xl border border-line bg-white p-5 shadow-sm">
      <h2 id="available-now-title" className="text-lg font-semibold text-brand">
        Disponibles ahora
        <span className="ml-2 text-sm font-medium text-stone-500">{couriers.length}</span>
      </h2>

      {couriers.length === 0 ? (
        <p className="mt-2 text-sm text-amber-800">Ningún repartidor disponible.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {couriers.map((courier) => (
            <li key={courier.id} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-baseline sm:gap-4">
              <span className="font-medium text-stone-800">{courier.name}</span>
              <span className="text-sm text-stone-600">Desde las {formatClock(courier.since)}</span>
              <span className="text-sm text-stone-500">
                {courier.zones.length > 0 ? courier.zones.join(", ") : "Sin zonas cargadas"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
