"use client";

import { useRef, useState } from "react";

import { createClient } from "@/lib/supabase-browser";
import {
  DEFAULT_IMAGE_BUCKET,
  defaultImagePath,
  validateDefaultImageFile,
} from "@/lib/superadmin/default-images";

// Sube la ilustración al bucket `default-images` con la sesión del superadmin (el RLS de Storage solo lo
// deja a él) y devuelve su dirección pública. La validación de acá es solo para avisar antes de subir.
export default function DefaultImageUploader({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);

    const check = validateDefaultImageFile(file);
    if (!check.ok) {
      setError(check.error);
      return;
    }

    setUploading(true);

    try {
      const supabase = createClient();
      const path = defaultImagePath(file.type, crypto.randomUUID());

      const { error: uploadError } = await supabase.storage
        .from(DEFAULT_IMAGE_BUCKET)
        .upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });

      if (uploadError) {
        setError("No pudimos subir la imagen. Probá de nuevo.");
        return;
      }

      onChange(supabase.storage.from(DEFAULT_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl);
    } catch {
      setError("No pudimos subir la imagen. Probá de nuevo.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <div className="flex items-center gap-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-line bg-cream">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-full w-full object-contain p-1" />
          ) : (
            <span className="text-xs text-stone-400">Sin imagen</span>
          )}
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="rounded-xl border border-line-strong bg-white px-4 py-2 text-sm font-medium text-brand transition hover:bg-brand-soft disabled:opacity-60"
        >
          {uploading ? "Subiendo…" : value ? "Cambiar imagen" : "Subir imagen"}
        </button>
      </div>
      <p className="mt-1.5 text-xs text-stone-500">WebP, PNG, JPG o SVG, hasta 1 MB.</p>

      <input
        ref={inputRef}
        type="file"
        accept="image/webp,image/png,image/jpeg,image/svg+xml"
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
