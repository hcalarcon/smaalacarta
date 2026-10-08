"use client";

import { useEffect, useState } from "react";

import { suggestProductImageAction } from "../actions/default-image";
import { defaultImageHint, type Suggestion } from "@/lib/menu/default-image-hint";

// Muestra de solo lectura qué se verá en el menú público para un producto sin foto: la ilustración que
// le toca por su nombre, o el logo (ADMIN-CONFIG-32). Consulta la base 400 ms después de que se deja de
// escribir; no pregunta nada con una foto propia o sin nombre.
export default function DefaultImageHint({
  name,
  categoryName,
  hasOwnImage,
  enabled,
  hasLogo,
}: {
  name: string;
  categoryName: string | null;
  hasOwnImage: boolean;
  enabled: boolean;
  hasLogo: boolean;
}) {
  const query = name.trim();
  const needsLookup = !hasOwnImage && enabled && query !== "";
  const [result, setResult] = useState<{ key: string; suggestion: Suggestion | null } | null>(null);
  const key = `${query}|${categoryName ?? ""}`;

  useEffect(() => {
    if (!needsLookup) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      const response = await suggestProductImageAction(query, categoryName);
      if (!cancelled) setResult({ key, suggestion: response.ok ? response.suggestion : null });
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [needsLookup, query, categoryName, key]);

  // Mientras no llegó la respuesta de este nombre, no se afirma nada.
  if (needsLookup && result?.key !== key) return null;

  const hint = defaultImageHint({
    hasOwnImage,
    enabled,
    suggestion: needsLookup ? (result?.suggestion ?? null) : null,
    hasLogo,
  });

  if (!hint) return null;

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-cream p-3 text-sm text-stone-600" aria-live="polite">
      {hint.kind === "illustration" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={hint.imageUrl} alt="" className="h-12 w-12 shrink-0 object-contain" />
      ) : null}
      <p>{hint.text}</p>
    </div>
  );
}
