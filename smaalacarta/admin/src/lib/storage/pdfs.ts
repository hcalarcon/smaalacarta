// El PDF del menú de un negocio, en el bucket `business-pdfs` (PDF-2). Los mismos
// límites están en la base (tamaño y tipo del bucket): esto avisa antes de subir,
// no reemplaza esa comprobación.
export const PDF_BUCKET = "business-pdfs";
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

export function validatePdfFile(file: {
  type: string;
  size: number;
}): { ok: true } | { ok: false; error: string } {
  if (file.type !== "application/pdf") {
    return { ok: false, error: "Subí un archivo PDF." };
  }

  if (file.size <= 0) {
    return { ok: false, error: "El archivo está vacío." };
  }

  if (file.size > MAX_PDF_BYTES) {
    return { ok: false, error: "El PDF pesa más de 10 MB. Probá con uno más chico." };
  }

  return { ok: true };
}

// Ruta dentro del bucket: siempre en la carpeta del negocio, con un identificador
// que elige el sistema. El nombre del archivo del usuario nunca se usa: podría traer
// barras, "..", espacios o una extensión falsa.
export function pdfPath(businessId: string, id: string) {
  if (!/^[A-Za-z0-9-]+$/.test(id)) {
    throw new Error("Identificador de PDF inválido");
  }

  return `${businessId}/${id}.pdf`;
}
