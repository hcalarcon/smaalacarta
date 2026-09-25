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
      <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-line-strong bg-white py-20 text-center">
        <h2 className="text-2xl font-bold text-brand">
          Tu menú está vacío
        </h2>

        <p className="mt-2 max-w-sm text-sm text-stone-500">
          Crea tu primera categoría para comenzar a cargar productos.
        </p>

        <button
          onClick={onClick}
          className="mt-6 rounded-2xl bg-brand px-5 py-3 text-sm font-medium text-white transition hover:opacity-90"
        >
          + Nueva categoría
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      className="w-full rounded-3xl border border-dashed border-line-strong bg-white py-5 text-sm font-medium text-stone-600 transition hover:border-stone-400 hover:bg-cream"
    >
      + Nueva categoría
    </button>
  );
}
