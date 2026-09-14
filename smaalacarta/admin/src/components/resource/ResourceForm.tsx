"use client";

export type FieldDefinition = {
  name: string;
  label: string;
  type: "text" | "textarea" | "number";
  required?: boolean;
  step?: string;
  min?: string;
  placeholder?: string;
};

type ResourceFormProps = {
  title: string;
  action: (formData: FormData) => Promise<void>;
  submitLabel: string;
  fields: FieldDefinition[];
  initialValues?: Record<string, string | number | boolean>;
  editId?: string;
  basePath: string;
  showActive?: boolean;
};

export default function ResourceForm({
  title,
  action,
  submitLabel,
  fields,
  initialValues,
  editId,
  basePath,
  showActive = true,
}: ResourceFormProps) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm shadow-slate-200/40 backdrop-blur-lg">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">
            Mantén los datos sincronizados con el negocio actual.
          </p>
        </div>
        {editId ? (
          <a
            href={basePath}
            className="rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-200"
          >
            Cancelar edición
          </a>
        ) : null}
      </div>

      <form action={action} className="grid gap-4">
        {editId ? <input type="hidden" name="id" value={editId} /> : null}

        {fields.map((field) => (
          <label key={field.name} className="grid gap-2 text-sm text-slate-700">
            <span className="font-medium">{field.label}</span>
            {field.type === "textarea" ? (
              <textarea
                name={field.name}
                defaultValue={String(initialValues?.[field.name] ?? "")}
                placeholder={field.placeholder}
                required={field.required}
                className="min-h-22.5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              />
            ) : (
              <input
                name={field.name}
                type={field.type}
                defaultValue={
                  field.type === "number"
                    ? String(initialValues?.[field.name] ?? "")
                    : String(initialValues?.[field.name] ?? "")
                }
                placeholder={field.placeholder}
                required={field.required}
                step={field.step}
                min={field.min}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              />
            )}
          </label>
        ))}

        {showActive ? (
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="active"
              defaultChecked={Boolean(initialValues?.active)}
              className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
            Activo
          </label>
        ) : null}

        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-2xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-700"
        >
          {submitLabel}
        </button>
      </form>
    </section>
  );
}
