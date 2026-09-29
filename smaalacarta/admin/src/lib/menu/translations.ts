// Traducciones opcionales de nombre y descripción (IDIOMA-8). Vacías, quedan nulas
// y el menú público usa el español.
export type Translations = {
  name_en?: string;
  name_pt?: string;
  description_en?: string;
  description_pt?: string;
};

export const TRANSLATION_KEYS = [
  "name_en",
  "name_pt",
  "description_en",
  "description_pt",
] as const;

// Columnas a guardar: texto sin espacios de sobra, o null si quedó vacío.
export function toTranslationColumns(input: Translations) {
  return {
    name_en: input.name_en?.trim() || null,
    name_pt: input.name_pt?.trim() || null,
    description_en: input.description_en?.trim() || null,
    description_pt: input.description_pt?.trim() || null,
  };
}

// ¿Cargó alguna? Sirve para abrir la sección plegable al editar.
export function hasTranslations(input: Translations | null | undefined) {
  return TRANSLATION_KEYS.some((key) => Boolean(input?.[key]?.trim()));
}

// Solo los campos de traducción de un objeto mayor (formularios, filas).
export function pickTranslations(input: Translations): Translations {
  return {
    name_en: input.name_en,
    name_pt: input.name_pt,
    description_en: input.description_en,
    description_pt: input.description_pt,
  };
}
