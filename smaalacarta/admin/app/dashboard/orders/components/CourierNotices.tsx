"use client";

import type { CourierEvent } from "@/lib/orders/courier-events";

export type CourierNotice = CourierEvent & { id: string };

// Los carteles de "tomado" y "devuelto" arriba del tablero (ADMIN-PEDIDOS-61). Solo pintan: qué avisos hay
// y cuándo suenan lo decide `OrdersClient`. Cada uno queda hasta su "Visto".
export default function CourierNotices({
  notices,
  onSeen,
  onGo,
}: {
  notices: CourierNotice[];
  onSeen: (id: string) => void;
  onGo: (orderId: string) => void;
}) {
  if (notices.length === 0) return null;

  return (
    <ul className="space-y-2">
      {notices.map((notice) => {
        const taken = notice.kind === "taken";
        const who = notice.courierName ?? "El repartidor";

        return (
          <li
            key={notice.id}
            role="status"
            className={`flex items-center gap-2 rounded-2xl border-2 bg-white p-2 pl-3 shadow-sm ${
              taken ? "border-[#047857]" : "border-[#d97706]"
            }`}
          >
            <button
              type="button"
              onClick={() => onGo(notice.orderId)}
              className="min-h-11 min-w-0 flex-1 text-left"
            >
              <span className={`block text-sm font-bold break-words ${taken ? "text-[#047857]" : "text-[#b45309]"}`}>
                {taken
                  ? `Pedido #${notice.orderNumber}: tomado por ${notice.courierName ?? "un repartidor"}`
                  : `Pedido #${notice.orderNumber}: ${who} lo devolvió. Buscando otro repartidor`}
              </span>
              {notice.reason ? (
                <span className="mt-0.5 block text-xs text-stone-600 break-words">Motivo: {notice.reason}</span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => onSeen(notice.id)}
              className="min-h-11 shrink-0 rounded-xl border border-line-strong px-4 text-sm font-semibold text-brand transition hover:bg-cream"
            >
              Visto
            </button>
          </li>
        );
      })}
    </ul>
  );
}
