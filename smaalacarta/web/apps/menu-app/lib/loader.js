// Loader de comida del menú interactivo (PUBLICO-83 y 84). Hay dos animaciones y se elige
// por la dirección mientras Herni decide cuál dejar: `?loader=cloche`.

export const LOADER_VARIANTS = ["hamburguesa", "cloche"];
export const DEFAULT_LOADER = "hamburguesa";

export function loaderVariant(search) {
  const value = new URLSearchParams(search || "").get("loader");
  return LOADER_VARIANTS.includes(value) ? value : DEFAULT_LOADER;
}
