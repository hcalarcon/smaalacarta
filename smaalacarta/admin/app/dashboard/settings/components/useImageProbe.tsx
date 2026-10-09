import { useState } from "react";

import type { Size } from "@/lib/settings/header-focus";

// Carga la imagen de cabecera en una etiqueta oculta para saber si anda y qué medidas tiene (el
// arrastre del punto de enfoque las necesita). Un error se recuerda por dirección, así que al
// cambiarla se vuelve a intentar (ADMIN-CONFIG-24). Hay que dibujar `probe` en algún lado.
export function useImageProbe(imageUrl: string) {
  const url = imageUrl.trim();
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ url: string; size: Size } | null>(null);
  const broken = brokenUrl === url;
  const naturalSize = imageSize && imageSize.url === url ? imageSize.size : null;

  const probe =
    url && !broken ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className="hidden"
        onLoad={(event) =>
          setImageSize({
            url,
            size: { w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight },
          })
        }
        onError={() => setBrokenUrl(url)}
      />
    ) : null;

  return { url, broken, naturalSize, probe, hasImage: Boolean(url) && !broken };
}
