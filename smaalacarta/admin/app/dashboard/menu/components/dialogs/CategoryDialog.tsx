"use client";

import { useState } from "react";

type CategoryDialogProps = {
  open: boolean;
  onClose: () => void;

  mode: "create" | "edit";

  initialData?: {
    id: string;
    name: string;
    description?: string | null;
    active?: boolean;
  } | null;

  onSubmit: (data: {
    id?: string;
    name: string;
    description?: string;
    active: boolean;
  }) => Promise<void>;
};

function CategoryDialogForm({
  onClose,
  mode,
  initialData,
  onSubmit,
}: CategoryDialogProps) {
  const [name, setName] = useState(initialData?.name ?? "");
  const [description, setDescription] = useState(
    initialData?.description ?? "",
  );
  const [active, setActive] = useState(initialData?.active ?? true);
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    await onSubmit({
      id: initialData?.id,
      name,
      description,
      active,
    });

    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-brand">
            {mode === "create" ? "Nueva categoría" : "Editar categoría"}
          </h2>

          <p className="mt-1 text-sm text-stone-500">
            Organiza mejor los productos del menú.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-stone-700">
              Nombre
            </label>

            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Ej. Hamburguesas"
              className="w-full rounded-2xl border border-line px-4 py-3 outline-none transition focus:border-stone-400"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-stone-700">
              Descripción
            </label>

            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Opcional"
              className="min-h-[100px] w-full rounded-2xl border border-line px-4 py-3 outline-none transition focus:border-stone-400"
            />
          </div>

          <label className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-4 w-4"
            />

            <span className="text-sm font-medium text-stone-700">
              Categoría activa
            </span>
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-line px-4 py-3 text-sm font-medium text-stone-700 transition hover:bg-brand-soft"
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="rounded-2xl bg-brand px-5 py-3 text-sm font-medium text-white transition hover:opacity-90"
            >
              {mode === "create" ? "Crear" : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// El formulario se monta al abrir y se desmonta al cerrar, así que su estado
// arranca siempre desde `initialData` sin copiarlo desde un efecto.
export default function CategoryDialog(props: CategoryDialogProps) {
  if (!props.open) return null;

  return (
    <CategoryDialogForm key={props.initialData?.id ?? "nueva"} {...props} />
  );
}
