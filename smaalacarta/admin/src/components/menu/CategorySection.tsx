"use client";

import { rectSortingStrategy } from "@dnd-kit/sortable";

import { Product } from "@/lib/db/products";
import ProductCard from "./ProductCard";
import { SortableItem, SortableList } from "./Sortable";
import DropdownMenu from "@/components/ui/DropdownMenu";

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
  open: boolean;
  onToggle: (open: boolean) => void;
  // Falso mientras hay un buscador o filtro activo: reordenar una lista
  // filtrada rompería el orden real, así que se muestra sin arrastrar.
  sortable?: boolean;
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
  open,
  onToggle,
  sortable = true,
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
      open={open}
      onToggle={(event) =>
        onToggle((event.target as HTMLDetailsElement).open)
      }
      className="group rounded-2xl border border-line bg-cream/60 p-3"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-2 py-1.5 transition hover:bg-white">
        <div className="flex min-w-0 items-center gap-2">
          {handle}

          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4 shrink-0 text-stone-400 transition-transform group-open:rotate-90"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>

          <div className="min-w-0">
            <h2 className="truncate text-xl font-bold text-brand">
              {category.name}
            </h2>

            <p className="text-xs text-stone-500">
              {products.length === 0
                ? "Sin productos"
                : `${products.length} productos`}
            </p>
          </div>
        </div>

        {/* Evita que un clic acá también abra/cierre la categoría (nativo de <summary>). */}
        <div
          className="flex items-center gap-2"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            onClick={onCreateProduct}
            className="rounded-xl bg-brand px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90"
          >
            + Producto
          </button>

          <DropdownMenu label="Opciones de la categoría">
            {(close) => (
              <>
                <button
                  onClick={() => {
                    close();
                    onEdit();
                  }}
                  className="w-full rounded-xl px-3 py-2 text-left text-sm transition hover:bg-brand-soft"
                >
                  Editar
                </button>

                <button
                  className="w-full rounded-xl px-3 py-2 text-left text-sm text-red-600 transition hover:bg-red-50"
                  onClick={() => {
                    close();
                    onDelete();
                  }}
                >
                  Eliminar
                </button>
              </>
            )}
          </DropdownMenu>
        </div>
      </summary>

      {products.length > 0 ? (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {sortable ? (
            <SortableList
              ids={products.map((product) => product.id)}
              onReorder={onReorderProducts}
              strategy={rectSortingStrategy}
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
          ) : (
            products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onEdit={() => onEditProduct(product)}
                onDelete={() => onDeleteProduct(product)}
                onToggleActive={() => onToggleProduct(product)}
              />
            ))
          )}
        </div>
      ) : (
        <div className="mt-3 rounded-2xl border border-dashed border-line-strong p-5 text-center text-sm text-stone-500">
          No hay productos cargados en esta categoría.
        </div>
      )}
    </details>
  );
}
