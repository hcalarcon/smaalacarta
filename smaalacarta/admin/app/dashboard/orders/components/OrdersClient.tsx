"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import ManualOrderDialog from "./ManualOrderDialog";
import OrderCard from "./OrderCard";
import OrderDetailDialog from "./OrderDetailDialog";
import { setOrderStatusAction } from "../actions";
import type { Order } from "@/lib/db/orders";
import { boardColumn, type BoardColumn } from "@/lib/orders/status";

const COLUMNS: { key: BoardColumn; title: string; hint: string }[] = [
  { key: "nuevos", title: "Nuevos", hint: "Esperando confirmación" },
  { key: "en_curso", title: "En curso", hint: "Confirmados y en preparación" },
  { key: "listos", title: "Listos", hint: "Para entregar o retirar" },
  { key: "cerrados", title: "Terminados", hint: "Últimos entregados o cancelados" },
];

const REFRESH_MS = 20_000;
const CLOSED_SHOWN = 10;

export default function OrdersClient({
  slug,
  orders,
  products,
  serverNow,
}: {
  slug: string;
  orders: Order[];
  products: { name: string; price: number }[];
  serverNow: string;
}) {
  const router = useRouter();

  // La hora arranca con la del servidor para que el primer render coincida en los dos
  // lados; después se actualiza sola.
  const [now, setNow] = useState(() => new Date(serverNow));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  // Actualiza el tablero cada 20 segundos, solo con la pestaña a la vista.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") {
        setNow(new Date());
        router.refresh();
      }
    }, REFRESH_MS);

    return () => clearInterval(id);
  }, [router]);

  async function changeStatus(orderId: string, status: string) {
    setError(null);
    setBusyId(orderId);

    try {
      const result = await setOrderStatusAction(orderId, status);
      if (!result.ok) setError(result.error);
    } catch {
      setError("No pudimos guardar el cambio. Probá de nuevo.");
    } finally {
      setBusyId(null);
      router.refresh();
    }
  }

  const selected = orders.find((order) => order.id === selectedId) ?? null;

  const byColumn = (key: BoardColumn) => {
    const list = orders.filter((order) => boardColumn(order.status) === key);
    // Los nuevos y en curso, del más viejo al más nuevo (el más urgente primero); los
    // terminados, los más recientes.
    return key === "cerrados"
      ? list.slice(0, CLOSED_SHOWN)
      : [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-brand">Pedidos</h1>
          <p className="mt-2 text-stone-500">
            Se actualiza solo cada pocos segundos.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setManualOpen(true)}
          className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-hover"
        >
          + Pedido manual
        </button>
      </section>

      {error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {orders.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line-strong bg-white p-10 text-center text-stone-500">
          Todavía no hay pedidos. Cuando un cliente confirme uno desde tu menú, aparece acá.
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-4">
          {COLUMNS.map((column) => {
            const list = byColumn(column.key);
            const total = orders.filter((o) => boardColumn(o.status) === column.key).length;

            return (
              <section key={column.key} className="rounded-3xl bg-cream/70 p-4">
                <header className="mb-3 flex items-baseline justify-between">
                  <h2 className="font-semibold text-brand">{column.title}</h2>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-stone-600">
                    {total}
                  </span>
                </header>
                <p className="mb-3 text-xs text-stone-500">{column.hint}</p>

                <div className="space-y-3">
                  {list.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-line-strong p-4 text-center text-sm text-stone-400">
                      Sin pedidos
                    </p>
                  ) : (
                    list.map((order) => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        now={now}
                        busy={busyId === order.id}
                        onAdvance={(status) => changeStatus(order.id, status)}
                        onOpen={() => setSelectedId(order.id)}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <OrderDetailDialog
        order={selected}
        slug={slug}
        busy={busyId === selected?.id}
        onClose={() => setSelectedId(null)}
        onChangeStatus={(status) => selected && changeStatus(selected.id, status)}
      />

      <ManualOrderDialog
        open={manualOpen}
        products={products}
        onClose={() => setManualOpen(false)}
        onCreated={() => {
          setManualOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}
