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
    <section className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm shadow-slate-200/40 backdrop-blur-lg">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">
            Toca editar para modificar un registro existente.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
          {records.length} registros
        </span>
      </div>

      <div className="grid gap-4">
        {records.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
            No hay registros todavía.
          </div>
        ) : (
          records.map((record) => {
            const id = String(record[idKey] ?? "");
            return (
              <div
                key={id}
                className="rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:p-5"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-base font-semibold text-slate-900">
                      {String(record[labels.primary] ?? "")}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {String(record[labels.secondary] ?? "")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={`${basePath}?${editQueryKey}=${id}`}
                      className="rounded-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100"
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
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
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
