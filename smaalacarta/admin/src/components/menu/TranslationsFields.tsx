"use client";

import { hasTranslations, type Translations } from "@/lib/menu/translations";

const inputClass =
  "w-full rounded-2xl border border-line px-4 py-2.5 outline-none transition focus:border-stone-400";

const LANGS = [
  { code: "en", label: "Inglés" },
  { code: "pt", label: "Portugués" },
] as const;

// Sección plegable con nombre y descripción en inglés y portugués (IDIOMA-9).
// Se abre sola si ya hay algo cargado. Sin traducción automática.
export default function TranslationsFields({
  value,
  onChange,
}: {
  value: Translations;
  onChange: (next: Translations) => void;
}) {
  return (
    <details
      open={hasTranslations(value)}
      className="rounded-2xl border border-line px-4 py-3"
    >
      <summary className="cursor-pointer text-sm font-medium text-stone-700">
        Traducciones (opcional)
      </summary>

      <p className="mt-2 text-xs text-stone-500">
        Si dejás un campo vacío, el menú muestra el texto en español.
      </p>

      <div className="mt-3 space-y-4">
        {LANGS.map(({ code, label }) => {
          const nameKey = `name_${code}` as const;
          const descriptionKey = `description_${code}` as const;

          return (
            <div key={code} className="space-y-2">
              <p className="text-sm font-semibold text-stone-700">{label}</p>

              <input
                type="text"
                aria-label={`Nombre en ${label.toLowerCase()}`}
                placeholder="Nombre"
                value={value[nameKey] ?? ""}
                onChange={(e) =>
                  onChange({ ...value, [nameKey]: e.target.value })
                }
                className={inputClass}
              />

              <textarea
                aria-label={`Descripción en ${label.toLowerCase()}`}
                placeholder="Descripción"
                rows={2}
                value={value[descriptionKey] ?? ""}
                onChange={(e) =>
                  onChange({ ...value, [descriptionKey]: e.target.value })
                }
                className={inputClass}
              />
            </div>
          );
        })}
      </div>
    </details>
  );
}
