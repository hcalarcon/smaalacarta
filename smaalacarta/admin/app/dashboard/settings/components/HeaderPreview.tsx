"use client";

import { useState } from "react";

// Vista previa de la cabecera: colores de marca y, si carga, la imagen. Un error de carga
// se recuerda por dirección, así que al cambiarla se vuelve a intentar (ADMIN-CONFIG-24).
export default function HeaderPreview({
  imageUrl,
  primaryColor,
  secondaryColor,
}: {
  imageUrl: string;
  primaryColor: string;
  secondaryColor: string;
}) {
  const url = imageUrl.trim();
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const broken = brokenUrl === url;

  return (
    <>
      <div
        className="relative h-32 overflow-hidden rounded-2xl"
        style={{
          background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
        }}
      >
        {url && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            onError={() => setBrokenUrl(url)}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : null}
        <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/50 to-transparent p-4">
          <span className="text-lg font-semibold text-white">Vista previa</span>
        </div>
      </div>
      {url && broken ? (
        <p className="-mt-3 text-sm text-amber-700">
          No pudimos cargar esa imagen. Revisá la dirección.
        </p>
      ) : null}
    </>
  );
}
