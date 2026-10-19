// Animaciones y fondo del menú público (PUBLICO-102 a 110): lo que el negocio elige en Configuración → Animaciones.
// Las mismas listas y reglas están en la base (`save_menu_look`, los CHECK de `business_settings`) y en el menú
// (`web/apps/menu-app/lib/menu-look.js` y `loader.js`).

export const MENU_ANIMATIONS = [
  { key: "estandar", label: "Estándar", hint: "La entrada de siempre: el menú aparece con un fundido." },
  { key: "suave", label: "Suave", hint: "Los productos suben despacio, uno tras otro." },
  { key: "dinamica", label: "Dinámica", hint: "Los productos rebotan al entrar y los títulos se deslizan." },
  { key: "ninguna", label: "Sin animaciones", hint: "No se mueve nada: el menú aparece de una." },
] as const;

export type MenuAnimationKey = (typeof MENU_ANIMATIONS)[number]["key"];

export const LOADER_PRESETS = [
  { key: "hamburguesa", label: "Hamburguesa" },
  { key: "pizza", label: "Pizza" },
  { key: "cafe", label: "Café" },
  { key: "helado", label: "Helado" },
  { key: "parrilla", label: "Parrilla" },
  { key: "sushi", label: "Sushi" },
  { key: "pastas", label: "Pastas" },
  { key: "panificados", label: "Panificados" },
] as const;

export const CUSTOM_LOADER = "custom";

export type LoaderKey = (typeof LOADER_PRESETS)[number]["key"] | typeof CUSTOM_LOADER;

// Los cuatro datos, tal como viajan en `SettingsInput`.
export type MenuLook = {
  menuAnimation: string;
  loaderAnimation: string;
  // La animación propia (solo cuenta con `loaderAnimation === "custom"`) y la imagen de fondo; vacíos si no hay.
  loaderCustomUrl: string;
  backgroundImageUrl: string;
};

// Los negocios que ya existían quedan como se ven hoy.
export const DEFAULT_MENU_LOOK: MenuLook = {
  menuAnimation: "estandar",
  loaderAnimation: "hamburguesa",
  loaderCustomUrl: "",
  backgroundImageUrl: "",
};

// Solo https y sin caracteres que rompan un atributo o un estilo (mismo criterio que la base).
const IMAGE_URL = /^https:\/\/[^\s"'()<>\\]+$/;

export type MenuLookErrors = Partial<Record<"menuAnimation" | "loaderAnimation" | "loaderCustomUrl" | "backgroundImageUrl", string>>;

export function validateMenuLook(look: MenuLook): MenuLookErrors {
  const errors: MenuLookErrors = {};

  if (!MENU_ANIMATIONS.some((option) => option.key === look.menuAnimation)) {
    errors.menuAnimation = "Elegí una de las animaciones.";
  }

  const known =
    look.loaderAnimation === CUSTOM_LOADER || LOADER_PRESETS.some((option) => option.key === look.loaderAnimation);
  if (!known) {
    errors.loaderAnimation = "Elegí una de las animaciones de carga.";
  }

  const custom = look.loaderCustomUrl.trim();
  if (look.loaderAnimation === CUSTOM_LOADER && !custom) {
    errors.loaderCustomUrl = "Subí el archivo de tu animación o elegí una de las de comida.";
  } else if (custom && !IMAGE_URL.test(custom)) {
    errors.loaderCustomUrl = "Ingresá una dirección que empiece con https://";
  }

  const background = look.backgroundImageUrl.trim();
  if (background && !IMAGE_URL.test(background)) {
    errors.backgroundImageUrl = "Ingresá una dirección que empiece con https://";
  }

  return errors;
}

// Lo que se manda al menú (la vista previa del panel y `build_public_menu` hablan igual): `animacionMenu`,
// `animacionCarga`, `animacionCargaUrl` (solo con la propia) y `fondo` (solo si hay).
export function lookToConfig(look: MenuLook): Record<string, string> {
  const config: Record<string, string> = {
    animacionMenu: look.menuAnimation,
    animacionCarga: look.loaderAnimation,
  };

  const custom = look.loaderCustomUrl.trim();
  if (look.loaderAnimation === CUSTOM_LOADER && custom) config.animacionCargaUrl = custom;

  const background = look.backgroundImageUrl.trim();
  if (background) config.fondo = background;

  return config;
}
