// Datos fijos del pedido demo y las reglas puras para armarlo a partir del menú real.
import { hasOptions } from "../../smaalacarta/web/apps/menu-app/lib/options.js";

export const BUSINESS_ID = "dbea2e5c-3f74-4b35-b8d8-2a3e17a12f56";
export const SLUG = "san-julia-resto";
export const ZONA = "Centro";

// Lo que marca un pedido como demo: el teléfono y la nota. `--borrar` exige las dos cosas.
export const DEMO_PHONE = "+54 9 0000 000036";
export const DEMO_NOTE = "[demo-video]";

export const CLIENTE = {
  nombre: "Lucía Fernández",
  telefono: DEMO_PHONE,
  direccion: "Av. Belgrano 1250",
  notas: `${DEMO_NOTE} Sin cebolla, por favor`,
};

// Qué tocar en un grupo de opciones para cumplir su mínimo: [{ nombre, veces }], [] si es opcional y
// null si no se puede cumplir (opciones agotadas de más).
export function planGroup(group) {
  const min = Number(group?.min) || 0;
  if (min < 1) return [];
  const free = (group.opciones ?? []).filter((option) => option.agotado !== true);
  if (group.repetir) return free.length ? [{ nombre: free[0].nombre, veces: min }] : null;
  if (free.length < min) return null;
  return free.slice(0, min).map((option) => ({ nombre: option.nombre, veces: 1 }));
}

const orderable = (item) => item?.agotado !== true && Number(item?.precio) > 0 && Boolean(item?.nombre);

// Un producto con opciones (que se pueda completar) y dos sin opciones de categorías distintas si
// hay. Devuelve { conOpciones, simples, categorias }; los pedidos se leen del menú público real.
export function pickProducts(menu) {
  const all = (menu?.categorias ?? []).flatMap((categoria) =>
    (categoria.items ?? []).filter(orderable).map((item) => ({ item, categoria: categoria.nombre })),
  );

  const conOpciones =
    all.find(({ item }) => hasOptions(item) && item.opciones.every((group) => planGroup(group) !== null)) ?? null;

  const plain = all.filter(({ item }) => !hasOptions(item));
  const simples = [];
  for (const entry of plain) {
    if (simples.length < 2 && !simples.some((s) => s.categoria === entry.categoria)) simples.push(entry);
  }
  for (const entry of plain) {
    if (simples.length < 2 && !simples.includes(entry)) simples.push(entry);
  }

  return { conOpciones, simples, categorias: (menu?.categorias ?? []).map((categoria) => categoria.nombre) };
}
