"use client";

import type { Order } from "@/lib/db/orders";
import { localOrderState, sumSettlements } from "@/lib/courier/settlements";
import type { OrderCourier } from "@/lib/orders/courier";
import { formatMoney } from "@/lib/promotions/pricing";

// Resumen de las rendiciones del efectivo de los repartidores (ENVIO-43), sobre los pedidos que
// carga el tablero. No aparece si no hay nada en efectivo con envío. Si hay pedidos de más de un
// repartidor, cada uno tiene su renglón (ENVIO-127).
export default function SettlementSummary({
  orders,
  couriers = [],
}: {
  orders: Order[];
  couriers?: OrderCourier[];
}) {
  const states = orders.map((order) => ({
    state: localOrderState(order),
    amount: Number(order.total),
    courierId: order.courier_id,
  }));
  const relevantItems = states.filter((item) => item.state !== "none");
  if (relevantItems.length === 0) return null;

  const totals = sumSettlements(states);

  const cells = [
    { label: "Pendiente de rendir", value: totals.pending, hint: "Entregado, el repartidor todavía no lo rindió" },
    { label: "Rendido, por confirmar", value: totals.settled, hint: "Marcá Recibido cuando lo tengas" },
    { label: "Recibido", value: totals.received, hint: "Ya confirmado" },
  ];

  const courierIds = [...new Set(relevantItems.map((item) => item.courierId ?? ""))];
  const perCourier =
    courierIds.length > 1
      ? courierIds.map((id) => ({
          id,
          name: couriers.find((courier) => courier.id === id)?.name ?? "Repartidor",
          totals: sumSettlements(relevantItems.filter((item) => (item.courierId ?? "") === id)),
        }))
      : [];

  return (
    <section
      aria-label="Rendiciones de repartidores"
      className="rounded-3xl border border-line bg-white p-4 shadow-sm sm:p-5"
    >
      <header>
        <h2 className="font-semibold text-brand">Rendiciones de repartidores</h2>
        <p className="mt-1 text-xs text-stone-500">
          Efectivo de los pedidos con envío, sin el envío, de los pedidos que muestra esta pantalla.
        </p>
      </header>

      <dl className="mt-3 grid gap-3 sm:grid-cols-3">
        {cells.map((cell) => (
          <div key={cell.label} className="rounded-2xl bg-cream p-3">
            <dt className="text-xs font-medium text-stone-500">{cell.label}</dt>
            <dd className="mt-1 text-xl font-bold text-brand">{formatMoney(cell.value)}</dd>
            <p className="text-[11px] text-stone-500">{cell.hint}</p>
          </div>
        ))}
      </dl>

      {perCourier.length > 0 && (
        <ul className="mt-3 divide-y divide-line text-sm">
          {perCourier.map((courier) => (
            <li key={courier.id} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2">
              <span className="font-medium text-brand">{courier.name}</span>
              <span className="text-xs text-stone-500">
                Pendiente {formatMoney(courier.totals.pending)} · Por confirmar{" "}
                {formatMoney(courier.totals.settled)} · Recibido {formatMoney(courier.totals.received)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
