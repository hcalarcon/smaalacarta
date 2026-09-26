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
}: {
  businessId: string;
  label: string;
  value: string;
  onChange: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);

  async function handleFile(file: File) {
    setError(null);

    const check = validateImageFile(file);
    if (!check.ok) {
      setError(check.error);
      return;
    }

    setUploading(true);

    try {
      const supabase = createClient();
      const path = imagePath(businessId, file.type, crypto.randomUUID());

      const { error: uploadError } = await supabase.storage
        .from(IMAGE_BUCKET)
        .upload(path, file, {
          contentType: file.type,
          cacheControl: "31536000",
          upsert: false,
        });

      if (uploadError) {
        setError("No pudimos subir la imagen. Probá de nuevo.");
        return;
      }

      const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);

      setBroken(false);
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
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-line bg-cream">
          {value && !broken ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt=""
              onError={() => setBroken(true)}
              className="h-full w-full object-cover"
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

          <p className="text-xs text-stone-500">JPG, PNG o WebP, hasta 2 MB.</p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
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
