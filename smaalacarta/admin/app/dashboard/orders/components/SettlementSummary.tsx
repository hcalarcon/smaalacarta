"use client";

import type { Order } from "@/lib/db/orders";
import { localOrderState, sumSettlements } from "@/lib/courier/settlements";
import { formatMoney } from "@/lib/promotions/pricing";

// Resumen de las rendiciones del efectivo de Repartos al Toque (ENVIO-43), sobre los pedidos que
// carga el tablero. No aparece si no hay nada en efectivo con envío.
export default function SettlementSummary({ orders }: { orders: Order[] }) {
  const states = orders.map((order) => ({ state: localOrderState(order), amount: Number(order.total) }));
  const relevant = states.filter((item) => item.state !== "none").length;
  if (relevant === 0) return null;

  const totals = sumSettlements(states);

  const cells = [
    { label: "Pendiente de rendir", value: totals.pending, hint: "Entregado, el repartidor todavía no lo rindió" },
    { label: "Rendido, por confirmar", value: totals.settled, hint: "Marcá Recibido cuando lo tengas" },
    { label: "Recibido", value: totals.received, hint: "Ya confirmado" },
  ];

  return (
    <section
      aria-label="Rendiciones de Repartos al Toque"
      className="rounded-3xl border border-line bg-white p-4 shadow-sm sm:p-5"
    >
      <header>
        <h2 className="font-semibold text-brand">Rendiciones de Repartos al Toque</h2>
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
    </section>
  );
}
