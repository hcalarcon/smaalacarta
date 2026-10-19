// La apariencia que elige cada negocio para su menú (PUBLICO-102 a 110): cómo se anima al entrar y una imagen de
// fondo opcional. Solo lógica pura sobre el documento: el movimiento es de CSS (`base.css`) y se apaga solo con
// `prefers-reduced-motion`, que se respeta aunque el negocio haya elegido una animación.

// `estandar` es lo que había antes de poder elegir (el fade de la página); `ninguna`, "Sin animaciones".
export const MENU_ANIMATIONS = ["estandar", "suave", "dinamica", "ninguna"];

const HTTPS_URL = /^https:\/\/[^\s"'()<>]+$/;

export function menuAnimation(config) {
  return MENU_ANIMATIONS.includes(config?.animacionMenu) ? config.animacionMenu : "estandar";
}

// La imagen de fondo va a una variable CSS dentro de `url("…")`: solo una dirección https sin comillas ni
// paréntesis, nada más.
export function backgroundUrl(config) {
  const url = typeof config?.fondo === "string" ? config.fondo.trim() : "";
  return HTTPS_URL.test(url) ? url : null;
}

// Aplica la animación y el fondo a la página. Se puede llamar de nuevo con otra configuración (la vista previa del
// panel): lo que ya no está, se quita. Devuelve lo aplicado.
export function applyMenuLook(doc, config) {
  const root = doc.documentElement;
  const animation = menuAnimation(config);
  const background = backgroundUrl(config);

  root.dataset.animacionMenu = animation;

  if (background) {
    root.classList.add("con-fondo");
    root.style.setProperty("--fondo-url", `url("${background}")`);
  } else {
    root.classList.remove("con-fondo");
    root.style.removeProperty("--fondo-url");
  }

  return { animation, background };
}
