"use client";

type ResourceListProps = {
  title: string;
  records: Array<Record<string, unknown>>;
  idKey?: string;
  labels: { primary: string; secondary: string };
  basePath: string;
  editQueryKey: string;
  deleteAction: (formData: FormData) => Promise<void>;
};

export default function ResourceList({
  title,
  records,
  idKey = "id",
  labels,
  basePath,
  editQueryKey,
  deleteAction,
}: ResourceListProps) {
  return (
    <section className="rounded-3xl border border-line bg-white/90 p-5 shadow-sm shadow-stone-200/40 backdrop-blur-lg">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-brand">{title}</h2>
          <p className="text-sm text-stone-500">
            Toca editar para modificar un registro existente.
          </p>
        </div>
        <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-stone-700">
          {records.length} registros
        </span>
      </div>

      <div className="grid gap-4">
        {records.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-line bg-cream p-6 text-sm text-stone-600">
            No hay registros todavía.
          </div>
        ) : (
          records.map((record) => {
            const id = String(record[idKey] ?? "");
            return (
              <div
                key={id}
                className="rounded-3xl border border-line bg-cream p-4 sm:p-5"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-base font-semibold text-brand">
                      {String(record[labels.primary] ?? "")}
                    </p>
                    <p className="mt-1 text-sm text-stone-600">
                      {String(record[labels.secondary] ?? "")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={`${basePath}?${editQueryKey}=${id}`}
                      className="rounded-full border border-line-strong bg-white px-3 py-2 text-sm text-stone-700 transition hover:bg-brand-soft"
                    >
                      Editar
                    </a>
                    <form action={deleteAction} method="post">
                      <input type="hidden" name="id" value={id} />
                      <button
                        type="submit"
                        className="rounded-full bg-rose-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-rose-600"
                      >
                        Eliminar
                      </button>
                    </form>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-500">
                  <span>Activo: {record.active ? "Sí" : "No"}</span>
                  <span>
                    Creado:{" "}
                    {new Date(String(record.created_at)).toLocaleDateString()}
                  </span>
                  {record.updated_at ? (
                    <span>
                      Actualizado:{" "}
                      {new Date(String(record.updated_at)).toLocaleDateString()}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
