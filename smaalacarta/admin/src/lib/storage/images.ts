// Imágenes de los negocios en el bucket `business-images` (ADMIN-CONFIG-7). Los
// mismos límites están en la base (tamaño y tipos del bucket): esto avisa antes de
// subir, no reemplaza esa comprobación.
export const IMAGE_BUCKET = "business-images";
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function validateImageFile(file: {
  type: string;
  size: number;
}): { ok: true } | { ok: false; error: string } {
  if (!(file.type in EXTENSIONS)) {
    return { ok: false, error: "Subí una imagen JPG, PNG o WebP." };
  }

  if (file.size <= 0) {
    return { ok: false, error: "El archivo está vacío." };
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: "La imagen pesa más de 2 MB. Probá con una más chica." };
  }

  return { ok: true };
}

// Ruta dentro del bucket: siempre en la carpeta del negocio, con un identificador
// que elige el sistema. El nombre del archivo del usuario nunca se usa: podría traer
// barras, "..", espacios o extensiones falsas.
export function imagePath(businessId: string, mimeType: string, id: string) {
  const extension = EXTENSIONS[mimeType];

  if (!extension) {
    throw new Error(`Tipo de imagen no permitido: ${mimeType}`);
  }

  if (!/^[A-Za-z0-9-]+$/.test(id)) {
    throw new Error("Identificador de imagen inválido");
  }

  return `${businessId}/${id}.${extension}`;
}
