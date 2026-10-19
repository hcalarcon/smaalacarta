// La animación de carga propia de un negocio, en el bucket `business-animations` (PUBLICO-104 y 105). Los mismos
// límites están en la base (tamaño y tipos del bucket, que Storage hace cumplir): esto avisa antes de subir, no
// reemplaza esa comprobación.
export const ANIMATION_BUCKET = "business-animations";
export const MAX_ANIMATION_BYTES = 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  "image/gif": "gif",
  "image/webp": "webp",
  "image/png": "png",
};

export const ANIMATION_ACCEPT = Object.keys(EXTENSIONS).join(",");

export function validateAnimationFile(file: {
  type: string;
  size: number;
}): { ok: true } | { ok: false; error: string } {
  if (!(file.type in EXTENSIONS)) {
    return { ok: false, error: "Subí un GIF, WebP o PNG animado." };
  }

  if (file.size <= 0) {
    return { ok: false, error: "El archivo está vacío." };
  }

  if (file.size > MAX_ANIMATION_BYTES) {
    return { ok: false, error: "La animación pesa más de 1 MB. Probá con una más liviana." };
  }

  return { ok: true };
}

// Ruta dentro del bucket: siempre en la carpeta del negocio, con un identificador que elige el sistema (el nombre
// del archivo del usuario nunca se usa).
export function animationPath(businessId: string, mimeType: string, id: string) {
  const extension = EXTENSIONS[mimeType];

  if (!extension) {
    throw new Error(`Tipo de animación no permitido: ${mimeType}`);
  }

  if (!/^[A-Za-z0-9-]+$/.test(id)) {
    throw new Error("Identificador de animación inválido");
  }

  return `${businessId}/${id}.${extension}`;
}
