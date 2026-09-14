// components/menu/CreateCategoryButton.tsx

type CreateCategoryButtonProps = {
  empty?: boolean;
  onClick: () => void;
};

export default function CreateCategoryButton({
  empty,
  onClick,
}: CreateCategoryButtonProps) {
  if (empty) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white py-20 text-center">
        <h2 className="text-2xl font-bold text-slate-900">
          Tu menú está vacío
        </h2>

        <p className="mt-2 max-w-sm text-sm text-slate-500">
          Crea tu primera categoría para comenzar a cargar productos.
        </p>

        <button
          onClick={onClick}
          className="mt-6 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:opacity-90"
        >
          + Nueva categoría
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      className="w-full rounded-3xl border border-dashed border-slate-300 bg-white py-5 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:bg-slate-50"
    >
      + Nueva categoría
    </button>
  );
}
