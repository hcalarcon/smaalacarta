// app/dashboard/menu/components/CategorySection.tsx

import { Product } from "@/lib/db/products";
import ProductCard from "./ProductCard";

type CategorySectionProps = {
  category: {
    id: string;
    name: string;
    description?: string | null;
    active?: boolean;
    products?: Product[];
  };
  onEdit: () => void;
  onDelete: () => void;
  onCreateProduct: () => void;
  onEditProduct: (product: Product) => void;
  onToggleProduct: (product: Product) => void;
};

export default function CategorySection({
  category,
  onEdit,
  onDelete,
  onCreateProduct,
  onEditProduct,
  onToggleProduct,
}: CategorySectionProps) {
  return (
    <details
      open
      className="group rounded-3xl border border-slate-200 bg-slate-50/60 p-4"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl px-2 py-2 transition hover:bg-white">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{category.name}</h2>

          {category.products?.length === 0
            ? "Sin productos"
            : `${category.products?.length ?? 0} productos`}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onCreateProduct}
            className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            + Producto
          </button>

          <details className="relative">
            <summary className="cursor-pointer list-none rounded-xl px-3 py-2 text-slate-500 transition hover:bg-slate-200">
              ⋮
            </summary>

            <div className="absolute right-0 top-12 z-10 w-44 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
              <button
                onClick={onEdit}
                className="w-full rounded-xl px-3 py-2 text-left text-sm transition hover:bg-slate-100"
              >
                Editar
              </button>

              <button
                className="w-full rounded-xl px-3 py-2 text-left text-sm text-red-600 transition hover:bg-red-50"
                onClick={onDelete}
              >
                Eliminar
              </button>
            </div>
          </details>
        </div>
      </summary>

      {category.products && category.products.length > 0 ? (
        <div className="mt-4 grid gap-4 ">
          {category.products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onEdit={() => onEditProduct(product)}
              onToggleActive={() => onToggleProduct(product)}
            />
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          No hay productos cargados en esta categoría.
        </div>
      )}
    </details>
  );
}
