"use client";

import { useState } from "react";

import TranslationsFields from "@/components/menu/TranslationsFields";
import ProductOptionGroupsPicker, {
  type PickerGroup,
} from "@/components/menu/ProductOptionGroupsPicker";
import DefaultImageHint from "../DefaultImageHint";
import ImageUploader from "@/components/ui/ImageUploader";
import { Product } from "@/lib/db/products";
import type { Translations } from "@/lib/menu/translations";

type ProductDialogProps = {
  open: boolean;
  initialData?: Product;
  mode: "create" | "edit";
  businessId: string;
  onClose: () => void;
  // Categoría donde se crea un producto nuevo; al editar no se usa.
  categoryId: string | null;
  // Grupos de opciones del negocio, los que ya tiene este producto (en su orden) y si está
  // en alguna promoción (ADMIN-OPCIONES-13).
  optionGroups: PickerGroup[];
  initialGroupIds: string[];
  inPromotion: boolean;
  // Imágenes de muestra (ADMIN-CONFIG-32): nombre de la categoría del producto, si el negocio las tiene
  // prendidas y si cargó su logo.
  categoryName: string | null;
  defaultImages: { enabled: boolean; hasLogo: boolean };
  onSubmit: (
    data: {
      id?: string;
      category_id: string | null;
      name: string;
      description?: string;
      price: number;
      active: boolean;
      image_url: string | null;
      featured: boolean;
      sold_out: boolean;
      option_group_ids: string[];
    } & Translations,
  ) => Promise<void>;
};

function ProductDialogForm({
  initialData,
  mode,
  businessId,
  onClose,
  categoryId,
  optionGroups,
  initialGroupIds,
  inPromotion,
  categoryName,
  defaultImages,
  onSubmit,
}: ProductDialogProps) {
  const editing = mode === "edit" && initialData;

  const [name, setName] = useState(editing ? initialData.name : "");
  const [description, setDescription] = useState(
    editing ? (initialData.description ?? "") : "",
  );
  const [price, setPrice] = useState(editing ? String(initialData.price) : "");
  const [active, setActive] = useState(editing ? initialData.active : true);
  const [featured, setFeatured] = useState(
    editing ? initialData.featured : false,
  );
  const [soldOut, setSoldOut] = useState(
    editing ? (initialData.sold_out ?? false) : false,
  );
  const [imageUrl, setImageUrl] = useState(
    editing ? (initialData.image_url ?? "") : "",
  );
  const [translations, setTranslations] = useState<Translations>({
    name_en: editing ? (initialData.name_en ?? "") : "",
    name_pt: editing ? (initialData.name_pt ?? "") : "",
    description_en: editing ? (initialData.description_en ?? "") : "",
    description_pt: editing ? (initialData.description_pt ?? "") : "",
  });
  const [groupIds, setGroupIds] = useState(initialGroupIds);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) return;

    setLoading(true);

    try {
      await onSubmit({
        id: editing ? initialData.id : undefined,
        category_id: categoryId,
        name: name.trim(),
        description: description.trim() || undefined,
        price: Number(price || 0),
        active,
        image_url: imageUrl || null,
        featured,
        sold_out: soldOut,
        option_group_ids: groupIds,
        ...translations,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl supports-[height:1dvh]:max-h-[90dvh]"
      >
        <div className="shrink-0 p-5 pb-3">
          <h2 className="text-xl font-semibold text-brand">
            {mode === "edit" ? "Editar producto" : "Nuevo producto"}
          </h2>

          <p className="mt-1 text-sm text-stone-500">
            {mode === "edit"
              ? "Modifica la información del producto."
              : "Completa los datos del producto."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-1">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <div>
                <label className="mb-1 block text-sm font-medium">Nombre</label>

                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-2xl border border-line-strong px-4 py-2.5"
                  placeholder="Ej. Coca Cola"
                  required
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
                  className="w-full rounded-2xl border border-line-strong px-4 py-2.5 sm:w-32"
                  placeholder="3500"
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Descripción
                </label>

                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-2xl border border-line-strong px-4 py-2.5"
                  rows={2}
                  placeholder="Descripción opcional"
                />
              </div>

              <ImageUploader
                businessId={businessId}
                label="Imagen (opcional)"
                value={imageUrl}
                onChange={setImageUrl}
              />
            </div>

            <DefaultImageHint
              name={name}
              categoryName={categoryName}
              hasOwnImage={imageUrl !== ""}
              enabled={defaultImages.enabled}
              hasLogo={defaultImages.hasLogo}
            />

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                />
                Producto activo
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={featured}
                  onChange={(e) => setFeatured(e.target.checked)}
                />
                Destacado
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={soldOut}
                  onChange={(e) => setSoldOut(e.target.checked)}
                />
                Sin stock
              </label>
            </div>

            <ProductOptionGroupsPicker
              groups={optionGroups}
              value={groupIds}
              onChange={setGroupIds}
              inPromotion={inPromotion}
            />

            <TranslationsFields
              value={translations}
              onChange={setTranslations}
            />
          </div>

          <div className="flex shrink-0 justify-end gap-3 border-t border-line p-4">
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

  return (
    <ProductDialogForm key={props.initialData?.id ?? "nuevo"} {...props} />
  );
}
