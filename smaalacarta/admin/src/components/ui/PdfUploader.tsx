"use client";

import { useRef, useState } from "react";

import { createClient } from "@/lib/supabase-browser";
import { PDF_BUCKET, pdfPath, validatePdfFile } from "@/lib/storage/pdfs";

// Sube el PDF del menú al bucket del negocio (con la sesión del usuario: el RLS de
// Storage solo deja escribir en la carpeta de su negocio). La validación de tipo y
// tamaño de acá es solo para avisar antes de subir; el bucket vuelve a comprobarla.
export default function PdfUploader({
  businessId,
  label,
  value,
  onChange,
}: {
  businessId: string;
  label: string;
  value: string;
  onChange: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);

    const check = validatePdfFile(file);
    if (!check.ok) {
      setError(check.error);
      return;
    }

    setUploading(true);

    try {
      const supabase = createClient();
      const path = pdfPath(businessId, crypto.randomUUID());

      const { error: uploadError } = await supabase.storage
        .from(PDF_BUCKET)
        .upload(path, file, {
          contentType: "application/pdf",
          cacheControl: "31536000",
          upsert: false,
        });

      if (uploadError) {
        setError("No pudimos subir el PDF. Probá de nuevo.");
        return;
      }

      const { data } = supabase.storage.from(PDF_BUCKET).getPublicUrl(path);
      onChange(data.publicUrl);
    } catch {
      setError("No pudimos subir el PDF. Probá de nuevo.");
    } finally {
      setUploading(false);
      // Permite volver a elegir el mismo archivo.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-brand">{label}</span>

      <div className="flex flex-wrap items-center gap-3">
        {value ? (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl border border-line bg-cream px-4 py-2 text-sm font-medium text-brand transition hover:bg-brand-soft"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-5 w-5 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <path d="M14 2v6h6" />
            </svg>
            Ver PDF actual
          </a>
        ) : (
          <span className="text-sm text-stone-500">Sin PDF cargado.</span>
        )}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="rounded-xl border border-line-strong bg-white px-4 py-2 text-sm font-medium text-brand transition hover:bg-brand-soft disabled:opacity-60"
        >
          {uploading ? "Subiendo…" : value ? "Cambiar PDF" : "Subir PDF"}
        </button>

        {value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            disabled={uploading}
            className="rounded-xl px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
          >
            Quitar
          </button>
        ) : null}
      </div>

      <p className="mt-1.5 text-xs text-stone-500">PDF, hasta 10 MB.</p>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      {error ? (
        <p role="alert" className="mt-1.5 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
