const LOADER_ANIMATIONS = new Set([
  "hamburguesa",
  "pizza",
  "cafe",
  "helado",
  "parrilla",
  "sushi",
  "pastas",
  "panificados",
]);

export function applyLoaderAnimation(config, doc = document) {
  const animation = LOADER_ANIMATIONS.has(config?.animacionCarga) ? config.animacionCarga : "hamburguesa";
  const loader = doc.querySelector("#loader");

  if (loader) loader.dataset.animacion = animation;

  return animation;
}
