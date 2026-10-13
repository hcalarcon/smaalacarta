"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import ConfirmDeleteDialog from "../../components/ConfirmDeleteDialog";
import { deletePromotionAction, setPromotionActiveAction } from "../actions";
import type { PromotionWithStock } from "@/lib/db/promotions";
import { promotionImage } from "@/lib/promotions/image";
import { formatMoney, promotionPricing } from "@/lib/promotions/pricing";
import { formatEnd, promotionStatus, type PromotionStatusKey } from "@/lib/promotions/validity";

// El color de cada estado (ADMIN-PROMO-11): vigente en verde, por vencer en ámbar, fuera del menú en rojo.
const STATUS_STYLES: Record<PromotionStatusKey, string> = {
  vigente: "bg-emerald-100 text-emerald-700",
  vence_hoy: "bg-amber-100 text-amber-800",
  vence_manana: "bg-amber-100 text-amber-800",
  vencida: "bg-red-100 text-red-700",
  agotada: "bg-red-100 text-red-700",
};

export default function PromotionsClient({
  promotions,
}: {
  promotions: PromotionWithStock[];
}) {
  const router = useRouter();

  const [toDelete, setToDelete] = useState<PromotionWithStock | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(promotion: PromotionWithStock) {
    setError(null);

    try {
      await setPromotionActiveAction(promotion.id, !promotion.active);
    } catch {
      setError("No pudimos cambiar el estado de la promoción.");
    }

    router.refresh();
  }

  async function confirmDelete() {
    if (!toDelete) return;

    try {
      setDeleting(true);
      await deletePromotionAction(toDelete.id);
      setToDelete(null);
      router.refresh();
    } catch {
      setError("No pudimos eliminar la promoción.");
    } finally {
      setDeleting(false);
    }
  }

  if (promotions.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-line-strong bg-white p-10 text-center text-stone-500">
        Todavía no armaste ninguna promoción. Creá la primera con &ldquo;Nueva
        promoción&rdquo;.
      </div>
    );
  }

  return (
    <>
      {error ? (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      ) : null}

      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {promotions.map((promotion) => {
          const products = promotion.promotion_items
            .map((item) => item.products)
            .filter((p): p is NonNullable<typeof p> => !!p);

          const pricing = promotionPricing(
            {
              type: promotion.type,
              discountPercent: Number(promotion.discount_percent),
              price: promotion.price == null ? null : Number(promotion.price),
            },
            products.map((p) => Number(p.price)),
          );

          const image = promotionImage({
            imageUrl: promotion.image_url,
            imageProductId: promotion.image_product_id,
            products: products.map((p) => ({ id: p.id, imageUrl: p.image_url })),
          });
          const status = promotionStatus({
            validUntil: promotion.valid_until,
            remaining: promotion.stats.remaining,
          });

          return (
            <li
              key={promotion.id}
              className={`flex flex-col rounded-3xl border border-line bg-white p-6 shadow-sm ${
                promotion.active ? "" : "opacity-60"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-cream">
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-stone-400">Sin foto</span>
                    )}
                  </span>
                  <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-brand">
                    {promotion.name}
                  </h2>
                  <p className="mt-1 text-sm text-stone-500">
                    {promotion.type === "combo"
                      ? "Combo a precio fijo"
                      : `${Number(promotion.discount_percent)} % de descuento`}
                  </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => toggle(promotion)}
                  aria-pressed={promotion.active}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition hover:opacity-80 ${
                    promotion.active
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-line text-stone-600"
                  }`}
                >
                  ● {promotion.active ? "Activa" : "Oculta"}
                </button>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
                <span
                  data-testid="promo-status"
                  className={`rounded-full px-2.5 py-1 font-medium ${STATUS_STYLES[status.key]}`}
                >
                  {status.label}
                </span>
                {promotion.valid_until ? <span>Hasta {formatEnd(promotion.valid_until)}</span> : null}
                {promotion.stock != null ? (
                  <span>
                    Quedan {promotion.stats.remaining ?? promotion.stock} de {promotion.stock} · {promotion.stats.sold}{" "}
                    {promotion.stats.sold === 1 ? "vendida" : "vendidas"}
                  </span>
                ) : null}
              </div>

              <ul className="mt-4 flex-1 space-y-1 text-sm text-stone-600">
                {products.length === 0 ? (
                  <li className="text-stone-400">Sin productos</li>
                ) : (
                  products.map((product) => (
                    <li key={product.id} className="truncate">
                      • {product.name}
                    </li>
                  ))
                )}
              </ul>

              <div className="mt-4 flex items-baseline gap-3">
                <span className="text-2xl font-bold text-brand">
                  {formatMoney(pricing.final)}
                </span>
                {pricing.saving > 0 ? (
                  <span className="text-sm text-stone-400 line-through">
                    {formatMoney(pricing.original)}
                  </span>
                ) : null}
              </div>

              <div className="mt-4 flex gap-2">
                <Link
                  href={`/dashboard/promotions/${promotion.id}`}
                  className="flex-1 rounded-xl border border-line-strong px-4 py-2 text-center text-sm font-medium text-brand transition hover:bg-brand-soft"
                >
                  Editar
                </Link>
                <button
                  type="button"
                  onClick={() => setToDelete(promotion)}
                  className="rounded-xl px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
                >
                  Eliminar
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <ConfirmDeleteDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Eliminar promoción"
        description={`¿Seguro que querés eliminar "${toDelete?.name}"? Los productos no se borran.`}
      />
    </>
  );
}
