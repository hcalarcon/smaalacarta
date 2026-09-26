"use client";

import { Product } from "@/lib/db/products";
import ProductCard from "./ProductCard";
import { SortableItem, SortableList } from "./Sortable";

type CategorySectionProps = {
  category: {
    id: string;
    name: string;
    description?: string | null;
    active?: boolean;
    products?: Product[];
  };
  // Asa para arrastrar la categoría (la arma <SortableItem>).
  handle?: React.ReactNode;
  onEdit: () => void;
  onDelete: () => void;
  onCreateProduct: () => void;
  onEditProduct: (product: Product) => void;
  onDeleteProduct: (product: Product) => void;
  onToggleProduct: (product: Product) => void;
  onReorderProducts: (orderedIds: string[]) => void;
};

export default function CategorySection({
  category,
  handle,
  onEdit,
  onDelete,
  onCreateProduct,
  onEditProduct,
  onDeleteProduct,
  onToggleProduct,
  onReorderProducts,
}: CategorySectionProps) {
  const products = category.products ?? [];

  return (
    <details
      open
      className="group rounded-3xl border border-line bg-cream/60 p-4"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-2xl px-2 py-2 transition hover:bg-white">
        <div className="flex min-w-0 items-center gap-2">
          {handle}

          <div className="min-w-0">
            <h2 className="truncate text-2xl font-bold text-brand">
              {category.name}
            </h2>

            <p className="text-sm text-stone-500">
              {products.length === 0
                ? "Sin productos"
                : `${products.length} productos`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onCreateProduct}
            className="rounded-2xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            + Producto
          </button>

          <details className="relative">
            <summary className="cursor-pointer list-none rounded-xl px-3 py-2 text-stone-500 transition hover:bg-line">
              ⋮
            </summary>

            <div className="absolute right-0 top-12 z-10 w-44 rounded-2xl border border-line bg-white p-2 shadow-xl">
              <button
                onClick={onEdit}
                className="w-full rounded-xl px-3 py-2 text-left text-sm transition hover:bg-brand-soft"
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

      {products.length > 0 ? (
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3">
          <SortableList
            ids={products.map((product) => product.id)}
            onReorder={onReorderProducts}
          >
            {products.map((product) => (
              <SortableItem key={product.id} id={product.id}>
                {(productHandle) => (
                  <ProductCard
                    product={product}
                    handle={productHandle}
                    onEdit={() => onEditProduct(product)}
                    onDelete={() => onDeleteProduct(product)}
                    onToggleActive={() => onToggleProduct(product)}
                  />
                )}
              </SortableItem>
            ))}
          </SortableList>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-line-strong p-6 text-center text-sm text-stone-500">
          No hay productos cargados en esta categoría.
        </div>
      )}
    </details>
  );
}
