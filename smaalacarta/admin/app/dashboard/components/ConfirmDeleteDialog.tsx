"use client";

type ConfirmDeleteDialogProps = {
  open: boolean;
  title?: string;
  description?: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  loading?: boolean;
};

export default function ConfirmDeleteDialog({
  open,
  title = "Eliminar elemento",
  description = "Esta acción no se puede deshacer.",
  onConfirm,
  onClose,
  loading = false,
}: ConfirmDeleteDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
        <h2 className="text-xl font-semibold text-brand">{title}</h2>

        <p className="mt-2 text-sm text-stone-500">{description}</p>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-line px-4 py-2 text-sm font-medium text-stone-700"
          >
            Cancelar
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className="rounded-2xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? "Eliminando..." : "Eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}
