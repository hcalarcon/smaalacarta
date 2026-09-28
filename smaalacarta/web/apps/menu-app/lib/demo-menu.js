// El menú estático también sirve las demos (ESTATICO-6): a diferencia de un
// negocio real, no salen de Supabase sino de los mismos JSON que usa el
// interactivo (`data/demos/<slug>/`). Un `require` literal por cada demo
// conocida, no un path armado en tiempo de ejecución (`` `.../${slug}/...` ``):
// el empaquetado de Vercel para funciones serverless sigue los `require`/`import`
// que puede ver en el código, no los que arma un template string.
import { createRequire } from "node:module";

import { normalizePublicMenu } from "./public-menu.js";

const require = createRequire(import.meta.url);

const DEMOS = {
  moderno: {
    config: require("../../../data/demos/moderno/config.json"),
    menu: require("../../../data/demos/moderno/menu.json"),
  },
  clasico: {
    config: require("../../../data/demos/clasico/config.json"),
    menu: require("../../../data/demos/clasico/menu.json"),
  },
  minimal: {
    config: require("../../../data/demos/minimal/config.json"),
    menu: require("../../../data/demos/minimal/menu.json"),
  },
};

// `{ config, menu }`, igual que `public_menu`, o null si no es una demo conocida.
export function getDemoMenu(slug) {
  const demo = DEMOS[slug];
  return demo ? normalizePublicMenu({ config: demo.config, menu: demo.menu }) : null;
}
