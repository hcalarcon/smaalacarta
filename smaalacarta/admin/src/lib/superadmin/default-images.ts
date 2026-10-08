// Reglas de la administración de imágenes predeterminadas (ADMIN-SUPER-21). Puras, para que las vean los
// tests; la pantalla y las acciones solo las llaman.

export const DEFAULT_IMAGE_BUCKET = "default-images";
export const MAX_DEFAULT_IMAGE_BYTES = 1024 * 1024;
export const NAME_MAX = 80;

const EXTENSIONS: Record<string, string> = {
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
};

// Mismo criterio que la restricción de la tabla: solo https y sin caracteres que rompan un atributo.
const IMAGE_URL = /^https:\/\/[^\s"'()<>]+$/;

// "hamburguesa, burger" -> ["hamburguesa", "burger"]. La base las normaliza al guardar; acá solo se
// separan, recortan y se descartan las vacías y las repetidas.
export function parseKeywords(text: string): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];

  for (const raw of text.split(/[,\n]/)) {
    const keyword = raw.trim();
    const key = keyword.toLowerCase();
    if (!keyword || seen.has(key)) continue;
    seen.add(key);
    keywords.push(keyword);
  }

  return keywords;
}

export type DefaultImageInput = {
  name: string;
  keywords: string;
  imageUrl: string;
  priority: number;
};

type Field = "name" | "keywords" | "imageUrl" | "priority";

export type DefaultImageValidation =
  | { ok: true }
  | { ok: false; errors: Partial<Record<Field, string>> };

export function validateDefaultImage(input: DefaultImageInput): DefaultImageValidation {
  const errors: Partial<Record<Field, string>> = {};

  const name = input.name.trim();
  if (!name) errors.name = "Poné un nombre.";
  else if (name.length > NAME_MAX) errors.name = `Usá hasta ${NAME_MAX} caracteres.`;

  if (parseKeywords(input.keywords).length === 0) {
    errors.keywords = "Escribí al menos una palabra clave, separadas por coma.";
  }

  if (!IMAGE_URL.test(input.imageUrl.trim())) {
    errors.imageUrl = "Subí una imagen o pegá una dirección que empiece con https://";
  }

  if (!Number.isInteger(input.priority) || input.priority < -100 || input.priority > 100) {
    errors.priority = "La prioridad es un número entero de -100 a 100.";
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
}

// Avisa antes de subir; el bucket vuelve a comprobar tipo y tamaño.
export function validateDefaultImageFile(file: {
  type: string;
  size: number;
}): { ok: true } | { ok: false; error: string } {
  if (!(file.type in EXTENSIONS)) {
    return { ok: false, error: "Subí una imagen WebP, PNG, JPG o SVG." };
  }

  if (file.size <= 0) return { ok: false, error: "El archivo está vacío." };

  if (file.size > MAX_DEFAULT_IMAGE_BYTES) {
    return { ok: false, error: "La imagen pesa más de 1 MB. Probá con una más chica." };
  }

  return { ok: true };
}

// Ruta dentro del bucket: un identificador del sistema y la extensión del tipo; el nombre del archivo
// del usuario nunca se usa.
export function defaultImagePath(mimeType: string, id: string) {
  const extension = EXTENSIONS[mimeType];
  if (!extension) throw new Error(`Tipo de imagen no permitido: ${mimeType}`);
  if (!/^[A-Za-z0-9-]+$/.test(id)) throw new Error("Identificador de imagen inválido");

  return `${id}.${extension}`;
}
