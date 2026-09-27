// Las secciones que arma el menú además de las categorías del negocio (MENU-1 a 3):
// "Destacados" con los productos marcados como destacados y "Ofertas" con los que tienen
// precio anterior o promo. Las usan el menú interactivo y el estático, para que los dos
// muestren lo mismo.

export function buildEnhancedMenu(menu) {
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
      nombre: "Destacados",
      tipo: "destacados",
      items: destacados,
    });
  }

  // Si el menú ya trae su categoría de ofertas (como las promociones del admin), no se
  // arma otra.
  const yaTieneOfertas = menu.categorias.some((cat) => cat.tipo === "ofertas");

  if (ofertas.length > 0 && !yaTieneOfertas) {
    nuevasCategorias.push({
      nombre: "Ofertas",
      tipo: "ofertas",
      items: ofertas,
    });
  }

  nuevasCategorias.push(...menu.categorias);

  return {
    ...menu,
    categorias: nuevasCategorias,
  };
}
