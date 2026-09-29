// Las secciones que arma el menú además de las categorías del negocio (MENU-1 a 3):
// "Destacados" con los productos marcados como destacados y "Ofertas" con los que tienen
// precio anterior o promo. Las usan el menú interactivo y el estático, para que los dos
// muestren lo mismo.

import { t } from "./i18n.js";

export function buildEnhancedMenu(menu, lang) {
  if (!menu?.categorias) return menu;

  const destacados = [];
  const ofertas = [];

  menu.categorias.forEach((cat) => {
    (cat.items || []).forEach((item) => {
      if (item.destacado) {
        destacados.push(item);
      }

      if (item.precioAnterior || item.promo) {
        ofertas.push(item);
      }
    });
  });

  const nuevasCategorias = [];

  if (destacados.length > 0) {
    nuevasCategorias.push({
      nombre: t("menu.destacados", lang),
      tipo: "destacados",
      items: destacados,
    });
  }

  // Si el menú ya trae su categoría de ofertas (como las promociones del admin), no se
  // arma otra.
  const yaTieneOfertas = menu.categorias.some((cat) => cat.tipo === "ofertas");

  if (ofertas.length > 0 && !yaTieneOfertas) {
    nuevasCategorias.push({
      nombre: t("menu.ofertas", lang),
      tipo: "ofertas",
      items: ofertas,
    });
  }

  // La categoría de ofertas que ya trae el menú también se muestra en el idioma elegido
  // (en español queda como la escribió el negocio).
  const traducida = (cat) =>
    lang && lang !== "es" && cat.tipo === "ofertas" ? { ...cat, nombre: t("menu.ofertas", lang) } : cat;

  nuevasCategorias.push(...menu.categorias.map(traducida));

  return {
    ...menu,
    categorias: nuevasCategorias,
  };
}
