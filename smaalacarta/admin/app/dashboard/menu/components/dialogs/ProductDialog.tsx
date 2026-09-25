"use client";

import { useState } from "react";

import ImageUploader from "@/components/ui/ImageUploader";
import { Product } from "@/lib/db/products";

type ProductDialogProps = {
  open: boolean;
  initialData?: Product;
  mode: "create" | "edit";
  businessId: string;
  onClose: () => void;
  // Categoría donde se crea un producto nuevo; al editar no se usa.
  categoryId: string | null;
  onSubmit: (data: {
    category_id: string | null;
    name: string;
    description?: string;
    price: number;
    active: boolean;
    image_url: string | null;
  }) => Promise<void>;
};

function ProductDialogForm({
  initialData,
  mode,
  businessId,
  onClose,
  categoryId,
  onSubmit,
}: ProductDialogProps) {
  const editing = mode === "edit" && initialData;

  const [name, setName] = useState(editing ? initialData.name : "");
  const [description, setDescription] = useState(
    editing ? (initialData.description ?? "") : "",
  );
  const [price, setPrice] = useState(editing ? String(initialData.price) : "");
  const [active, setActive] = useState(editing ? initialData.active : true);
  const [imageUrl, setImageUrl] = useState(
    editing ? (initialData.image_url ?? "") : "",
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) return;

    setLoading(true);

    try {
      await onSubmit({
        category_id: categoryId,
        name: name.trim(),
        description: description.trim() || undefined,
        price: Number(price || 0),
        active,
        image_url: imageUrl || null,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-brand">
            {mode === "edit" ? "Editar producto" : "Nuevo producto"}
          </h2>

          <p className="mt-1 text-sm text-stone-500">
            {mode === "edit"
              ? "Modifica la información del producto."
              : "Completa los datos del producto."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Nombre</label>

            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-2xl border border-line-strong px-4 py-3"
              placeholder="Ej. Coca Cola"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Descripción
            </label>

            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-2xl border border-line-strong px-4 py-3"
              rows={3}
              placeholder="Descripción opcional"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Precio</label>

            <input
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full rounded-2xl border border-line-strong px-4 py-3"
              placeholder="3500"
              required
            />
          </div>

          <ImageUploader
            businessId={businessId}
            label="Imagen (opcional)"
            value={imageUrl}
            onChange={setImageUrl}
          />

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            Producto activo
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-line-strong px-4 py-2"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={loading}
              className="rounded-2xl bg-brand px-4 py-2 text-white disabled:opacity-50"
            >
              {loading
                ? "Guardando..."
                : mode === "edit"
                  ? "Guardar cambios"
                  : "Crear producto"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// El formulario se monta al abrir y se desmonta al cerrar, así que su estado
// arranca siempre desde `initialData` sin copiarlo desde un efecto.
export default function ProductDialog(props: ProductDialogProps) {
  if (!props.open) return null;

  return <ProductDialogForm key={props.initialData?.id ?? "nuevo"} {...props} />;
}
