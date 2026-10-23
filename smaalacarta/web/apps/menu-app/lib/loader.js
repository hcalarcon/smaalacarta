const LOADER_ANIMATIONS = new Set([
  "hamburguesa",
  "pizza",
  "cafe",
  "helado",
  "parrilla",
  "sushi",
  "pastas",
  "panificados",
  "empanada",
]);

// La animación propia del negocio (PUBLICO-104) es una imagen alojada en su carpeta de Storage: solo https y sin
// caracteres que rompan un atributo.
const HTTPS_URL = /^https:\/\/[^\s"'()<>\\]+$/;

export function customLoaderUrl(config) {
  const url = typeof config?.animacionCargaUrl === "string" ? config.animacionCargaUrl.trim() : "";
  return config?.animacionCarga === "custom" && HTTPS_URL.test(url) ? url : null;
}

// El logo del negocio (PUBLICO-118) es el mismo `config.logo` del encabezado: la misma regla de dirección.
export function logoLoaderUrl(config) {
  const url = typeof config?.logo === "string" ? config.logo.trim() : "";
  return HTTPS_URL.test(url) ? url : null;
}

// Sin elección guardada (o 'logo') el cargador es el logo del negocio y, si no tiene, el de SMA a la Carta (`marca`).
function isLogoChoice(config) {
  return !config?.animacionCarga || config.animacionCarga === "logo";
}

// Elige la animación de carga: una de comida, el logo o la propia del negocio. Un GIF no se puede pausar con CSS, así que si
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

  if (isLogoChoice(config)) {
    const logo = logoLoaderUrl(config);
    const image = doc.querySelector("#loader-logo");

    // Una segunda llamada (el menú aplica la animación dos veces) no vuelve a mostrar un logo que ya falló.
    if (logo && image && loader && image.logoRoto !== logo) {
      // Si el logo no carga, queda el de SMA a la Carta en vez de un hueco.
      image.onerror = () => {
        image.logoRoto = logo;
        loader.dataset.animacion = "marca";
      };
      image.src = logo;
      loader.dataset.animacion = "logo";
      return "logo";
    }

    if (loader) loader.dataset.animacion = "marca";

    return "marca";
  }

  const animation = LOADER_ANIMATIONS.has(config?.animacionCarga) ? config.animacionCarga : "hamburguesa";

  if (loader) loader.dataset.animacion = animation;

  return animation;
}

// La configuración del negocio tarda en llegar (primero se cargan los módulos del menú). Para no dejar la pantalla
// vacía, se recuerda la última animación de este menú y se pone al abrir; la primera vez, un indicador neutro.
const LOOK_PREFIX = "sma-loader-animacion:";

export function rememberLoaderLook(storage, key, config) {
  try {
    const custom = customLoaderUrl(config);
    const animation = LOADER_ANIMATIONS.has(config?.animacionCarga) ? config.animacionCarga : "hamburguesa";
    const logo = logoLoaderUrl(config);
    const look = custom
      ? { a: "custom", url: custom }
      : isLogoChoice(config)
        ? { a: "logo", ...(logo ? { url: logo } : {}) }
        : { a: animation };
    storage.setItem(LOOK_PREFIX + key, JSON.stringify(look));
  } catch {
    // Sin almacenamiento: la próxima vez arranca con el indicador neutro.
  }
}

export function savedLoaderLook(storage, key) {
  try {
    const saved = JSON.parse(storage?.getItem(LOOK_PREFIX + key) || "null");
    if (saved?.a === "custom") return HTTPS_URL.test(saved.url || "") ? { animacionCarga: "custom", animacionCargaUrl: saved.url } : null;
    if (saved?.a === "logo") return HTTPS_URL.test(saved.url || "") ? { animacionCarga: "logo", logo: saved.url } : { animacionCarga: "logo" };
    return LOADER_ANIMATIONS.has(saved?.a) ? { animacionCarga: saved.a } : null;
  } catch {
    return null;
  }
}
