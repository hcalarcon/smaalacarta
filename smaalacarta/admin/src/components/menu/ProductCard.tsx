import { Product } from "@/lib/db/products";
import DropdownMenu from "@/components/ui/DropdownMenu";
import { productStatus } from "@/lib/menu/product-fields";

type ProductCardProps = {
  product: Product;
  // Asa para arrastrar (la arma <SortableItem>); sin ella, la tarjeta no se
  // puede arrastrar (por ejemplo, mientras hay un filtro aplicado).
  handle?: React.ReactNode;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
  onToggleSoldOut: () => void;
};

export default function ProductCard({
  product,
  handle,
  onEdit,
  onDelete,
  onToggleActive,
  onToggleSoldOut,
}: ProductCardProps) {
  const status = productStatus(product);

  return (
    <article
      className={`rounded-2xl border px-3 py-2 transition ${
        status === "hidden"
          ? "border-line bg-cream opacity-60"
          : status === "sold_out"
            ? "border-amber-300 bg-amber-50/40"
            : "border-line bg-white"
      }`}
    >
      <div className="flex items-center gap-2.5">
        {handle}

        {/* Imagen / Placeholder */}
        {product.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image_url}
            alt=""
            className="h-11 w-11 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="h-11 w-11 shrink-0 rounded-lg bg-line" />
        )}

        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-1 truncate text-sm font-semibold text-brand">
            {product.featured ? (
              <span
                title="Destacado"
                aria-label="Destacado"
                className="text-amber-500"
              >
                ★
              </span>
            ) : null}
            <span className="truncate">{product.name}</span>
          </h3>
          <p className="truncate text-xs text-stone-500">
            {product.description || "Sin descripción"}
          </p>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleActive}
            aria-pressed={product.active}
            title={product.active ? "Desactivar" : "Activar"}
            className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium transition hover:opacity-80 ${
              product.active
                ? "bg-emerald-100 text-emerald-700"
                : "bg-line text-stone-600"
            }`}
          >
            ● {product.active ? "Activo" : "Oculto"}
          </button>

          {/* Sin stock: sigue visible en el menú pero no se puede pedir (distinto de Oculto). */}
          <button
            type="button"
            onClick={onToggleSoldOut}
            aria-pressed={product.sold_out}
            title={
              product.sold_out ? "Volver a tener stock" : "Marcar sin stock"
            }
            className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium transition hover:opacity-80 ${
              product.sold_out
                ? "bg-amber-100 text-amber-800"
                : "bg-line text-stone-600"
            }`}
          >
            {product.sold_out ? "Sin stock" : "Con stock"}
          </button>

          {/* Tiene grupos de opciones y extras (ADMIN-OPCIONES-13). */}
          {product.has_options ? (
            <span className="whitespace-nowrap rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-brand">
              Con opciones
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="whitespace-nowrap text-sm font-bold text-brand">
            ${product.price}
          </span>

          <DropdownMenu label="Opciones del producto">
            {(close) => (
              <>
                <button
                  onClick={() => {
                    close();
                    onEdit();
                  }}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-brand-soft"
                >
                  Editar
                </button>

                <button
                  onClick={() => {
                    close();
                    onToggleActive();
                  }}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-brand-soft"
                >
                  {product.active ? "Desactivar" : "Activar"}
                </button>

                <button
                  onClick={() => {
                    close();
                    onToggleSoldOut();
                  }}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-brand-soft"
                >
                  {product.sold_out
                    ? "Volver a tener stock"
                    : "Marcar sin stock"}
                </button>

                <button
                  onClick={() => {
                    close();
                    onDelete();
                  }}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                >
                  Eliminar
                </button>
              </>
            )}
          </DropdownMenu>
        </div>
      </div>
    </article>
  );
}
