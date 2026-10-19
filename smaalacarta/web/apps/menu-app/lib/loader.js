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

// La animación propia del negocio (PUBLICO-104) es una imagen alojada en su carpeta de Storage: solo https y sin
// caracteres que rompan un atributo.
const HTTPS_URL = /^https:\/\/[^\s"'()<>\\]+$/;

export function customLoaderUrl(config) {
  const url = typeof config?.animacionCargaUrl === "string" ? config.animacionCargaUrl.trim() : "";
  return config?.animacionCarga === "custom" && HTTPS_URL.test(url) ? url : null;
}

// Elige la animación de carga: una de comida o la propia del negocio. Un GIF no se puede pausar con CSS, así que si
// el visitante pidió menos movimiento la propia no se usa y queda la de comida de siempre, que se ve quieta.
export function applyLoaderAnimation(config, doc = document) {
  const loader = doc.querySelector("#loader");
  const calm = Boolean(doc.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const custom = calm ? null : customLoaderUrl(config);

  // Desde cuándo se ve la animación elegida: `finishLoading` la deja correr al menos un segundo.
  if (loader) loader.dataset.desde = String(Date.now());

  if (custom) {
    const image = doc.querySelector("#loader-custom");

    if (image && loader) {
      // Si el archivo ya no está o no carga, vuelve a la de comida en vez de dejar el cargador vacío.
      image.onerror = () => {
        loader.dataset.animacion = "hamburguesa";
      };
      image.src = custom;
      loader.dataset.animacion = "custom";
      return "custom";
    }
  }

  const animation = LOADER_ANIMATIONS.has(config?.animacionCarga) ? config.animacionCarga : "hamburguesa";

  if (loader) loader.dataset.animacion = animation;

  return animation;
}
