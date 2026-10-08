// Qué se verá en el menú público para un producto (ADMIN-CONFIG-32). Solo lectura: la ilustración
// sugerida por la base, o el logo. Con imagen propia no hay nada que avisar.

export type Suggestion = { name: string; imageUrl: string };

export type DefaultImageHint =
  | { kind: "illustration"; imageUrl: string; text: string }
  | { kind: "logo"; text: string };

export function defaultImageHint(input: {
  hasOwnImage: boolean;
  // El interruptor "Mostrar imágenes de muestra" del negocio.
  enabled: boolean;
  suggestion: Suggestion | null;
  hasLogo: boolean;
}): DefaultImageHint | null {
  if (input.hasOwnImage) return null;

  const replace = "Si subís una foto propia, la reemplaza.";

  if (input.enabled && input.suggestion) {
    return {
      kind: "illustration",
      imageUrl: input.suggestion.imageUrl,
      text: `Sin foto, se verá la ilustración «${input.suggestion.name}», marcada como imagen ilustrativa. ${replace}`,
    };
  }

  const logo = input.hasLogo
    ? "el logo de tu negocio"
    : "el logo de SMA a la Carta (todavía no cargaste el tuyo)";

  return { kind: "logo", text: `Sin foto, se verá ${logo}. ${replace}` };
}
