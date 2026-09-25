"use client";

import { useEffect, useState } from "react";

import { Product } from "@/lib/db/products";

type ProductDialogProps = {
  open: boolean;
  initialData?: Product;
  mode: "create" | "edit";
  onClose: () => void;
  categoryId: string;
  onSubmit: (data: {
    category_id: string;
    name: string;
    description?: string;
    price: number;
    active: boolean;
  }) => Promise<void>;
};

export default function ProductDialog({
  open,
  initialData,
  mode,
  onClose,
  categoryId,
  onSubmit,
}: ProductDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [active, setActive] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setDescription("");
      setPrice("");
      setActive(true);
      return;
    }

    if (mode === "edit" && initialData) {
      setName(initialData.name);
      setDescription(initialData.description ?? "");
      setPrice(String(initialData.price));
      setActive(initialData.active);
    }
  }, [open, mode, initialData]);

  if (!open) return null;

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
