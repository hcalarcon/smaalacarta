"use client";

import type { Order } from "@/lib/db/orders";
import { formatDateTime } from "@/lib/orders/format";
import { scheduledShort } from "@/lib/orders/scheduled";
import { STATUS_LABELS, type OrderStatus } from "@/lib/orders/status";
import { formatMoney } from "@/lib/promotions/pricing";

// Cuándo terminó: el último evento de su línea de tiempo (o `updated_at` si por
// algún motivo no tiene eventos registrados).
function finishedAt(order: Order): string {
  const events = order.order_events;
  return events.length > 0
    ? events[events.length - 1].created_at
    : order.updated_at;
}

export default function OrdersHistory({
  orders,
  onOpen,
}: {
  orders: Order[];
  onOpen: (orderId: string) => void;
}) {
  return (
    <section className="rounded-3xl border border-line bg-white p-4 shadow-sm sm:p-5">
      <header>
        <h2 className="font-semibold text-brand">Historial</h2>
        <p className="mt-1 text-xs text-stone-500">
          Últimos pedidos entregados o cancelados.
        </p>
      </header>

      {orders.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-line-strong p-4 text-center text-sm text-stone-400">
          Todavía no hay pedidos terminados.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-stone-400">
                <th className="py-2 pr-3 font-medium">Pedido</th>
                <th className="py-2 pr-3 font-medium">Cliente</th>
                <th className="py-2 pr-3 font-medium">Estado</th>
                <th className="py-2 pr-3 font-medium">Total</th>
                <th className="py-2 pr-3 font-medium">Para</th>
                <th className="py-2 pr-3 font-medium">Empezó</th>
                <th className="py-2 pr-3 font-medium">Terminó</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {orders.map((order) => (
                <tr key={order.id} className="text-stone-700">
                  <td className="py-2.5 pr-3 font-medium text-brand">
                    #{order.order_number}
                    {order.source === "manual" ? (
                      <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand">
                        Manual
                      </span>
                    ) : null}
                  </td>
                  <td className="max-w-[10rem] truncate py-2.5 pr-3">
                    {order.customer_name || "Sin nombre"}
                  </td>
                  <td className="py-2.5 pr-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        order.status === "cancelled"
                          ? "bg-red-50 text-red-700"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {STATUS_LABELS[order.status as OrderStatus] ?? order.status}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 font-semibold text-brand">
                    {formatMoney(Number(order.total))}
                  </td>
                  <td className="py-2.5 pr-3 text-stone-500">
                    {scheduledShort(order)}
                  </td>
                  <td className="py-2.5 pr-3 text-stone-500">
                    {formatDateTime(order.created_at)}
                  </td>
                  <td className="py-2.5 pr-3 text-stone-500">
                    {formatDateTime(finishedAt(order))}
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => onOpen(order.id)}
                      className="rounded-xl border border-line-strong px-3 py-1.5 text-xs font-medium text-brand transition hover:bg-brand-soft"
                    >
                      Detalle
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
