"use client";

import { useRef, useState } from "react";

import { createClient } from "@/lib/supabase-browser";
import {
  IMAGE_BUCKET,
  imagePath,
  validateImageFile,
} from "@/lib/storage/images";

// Sube una imagen al bucket del negocio (con la sesión del usuario: el RLS de
// Storage solo deja escribir en la carpeta de su negocio) y devuelve su dirección
// pública. La validación de tipo y tamaño de acá es solo para avisar antes de subir;
// el bucket vuelve a comprobarla.
export default function ImageUploader({
  businessId,
  label,
  value,
  onChange,
  bucket = IMAGE_BUCKET,
  validate = validateImageFile,
  makePath = imagePath,
  accept = "image/jpeg,image/png,image/webp",
  hint = "JPG, PNG o WebP, hasta 2 MB.",
  fit = "cover",
  thumbClassName = "h-20 w-20",
}: {
  businessId: string;
  label: string;
  value: string;
  onChange: (url: string) => void;
  // Por defecto, las imágenes del negocio (JPG, PNG o WebP, 2 MB). Otras subidas, como la animación de carga
  // propia, traen su bucket, su validación y su ruta: la carpeta del negocio y el límite los hace cumplir Storage.
  bucket?: string;
  validate?: (file: { type: string; size: number }) => { ok: true } | { ok: false; error: string };
  makePath?: (businessId: string, mimeType: string, id: string) => string;
  accept?: string;
  hint?: string;
  fit?: "cover" | "contain";
  thumbClassName?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // La dirección que falló: si el valor cambia, deja de contar como rota (ADMIN-CONFIG-24).
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const broken = brokenUrl === value;

  async function handleFile(file: File) {
    setError(null);

    const check = validate(file);
    if (!check.ok) {
      setError(check.error);
      return;
    }

    setUploading(true);

    try {
      const supabase = createClient();
      const path = makePath(businessId, file.type, crypto.randomUUID());

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, file, {
          contentType: file.type,
          cacheControl: "31536000",
          upsert: false,
        });

      if (uploadError) {
        setError("No pudimos subir la imagen. Probá de nuevo.");
        return;
      }

      const { data } = supabase.storage.from(bucket).getPublicUrl(path);

      onChange(data.publicUrl);
    } catch {
      setError("No pudimos subir la imagen. Probá de nuevo.");
    } finally {
      setUploading(false);
      // Permite volver a elegir el mismo archivo.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-brand">{label}</span>

      <div className="flex items-center gap-4">
        <div
          className={`flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-line bg-cream ${thumbClassName}`}
        >
          {value && !broken ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt=""
              onError={() => setBrokenUrl(value)}
              className={`h-full w-full ${fit === "contain" ? "object-contain" : "object-cover"}`}
            />
          ) : (
            <span className="text-xs text-stone-400">Sin imagen</span>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="rounded-xl border border-line-strong bg-white px-4 py-2 text-sm font-medium text-brand transition hover:bg-brand-soft disabled:opacity-60"
            >
              {uploading ? "Subiendo…" : value ? "Cambiar imagen" : "Subir imagen"}
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

          <p className="text-xs text-stone-500">{hint}</p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
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
      {broken ? (
        <p className="mt-1.5 text-sm text-amber-700">
          No pudimos mostrar esa imagen. Revisá la dirección.
        </p>
      ) : null}
    </div>
  );
}
