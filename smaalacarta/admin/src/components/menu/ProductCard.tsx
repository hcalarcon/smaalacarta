// app/dashboard/menu/components/ProductCard.tsx

import { Product } from "@/lib/db/products";

type ProductCardProps = {
  product: Product;
  onEdit: () => void;
  onToggleActive: () => void;
};

export default function ProductCard({
  product,
  onEdit,
  onToggleActive,
}: ProductCardProps) {
  return (
    <article
      className={`w-[95%] rounded-2xl border px-3 py-2 transition ${
        product.active
          ? "border-line bg-white"
          : "border-line bg-cream opacity-60"
      }`}
    >
      <div className="flex items-center gap-3">
        {/* Imagen / Placeholder */}
        <div className="h-14 w-14 shrink-0 rounded-xl bg-line" />

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-brand">
                {product.name}
              </h3>

              <p className="truncate text-xs text-stone-500">
                {product.description || "Sin descripción"}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  product.active
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-line text-stone-600"
                }`}
              >
                ● {product.active ? "Activo" : "Oculto"}
              </span>

              <span className="whitespace-nowrap text-base font-bold text-brand">
                ${product.price}
              </span>

              <details className="relative">
                <summary className="cursor-pointer list-none rounded-lg px-2 py-1 text-stone-500 hover:bg-brand-soft">
                  ⋮
                </summary>

                <div className="absolute right-0 top-10 z-10 w-44 rounded-xl border border-line bg-white p-2 shadow-xl">
                  <button
                    onClick={onEdit}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-brand-soft"
                  >
                    Editar
                  </button>

                  <button
                    onClick={onToggleActive}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-brand-soft"
                  >
                    {product.active ? "Desactivar" : "Activar"}
                  </button>
                </div>
              </details>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
