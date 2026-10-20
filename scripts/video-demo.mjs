// Graba en video la app real con un pedido completo en Santa Julia Resto (tres pantallas a la vez).
// Uso:  npm run video-demo
//       npm run video-demo -- --borrar                       borra solo los pedidos demo
//       npm run video-demo -- --permitir-otros-repartidores  no frena si hay otros disponibles en Centro
// Requiere el admin compilado (`npm run build` y `npm run start`, no `next dev`) en localhost:3000 y `npx serve . -l 8000` en smaalacarta/web. Solo contra la base dev.
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { borrarDemo } from "./video-demo/borrar.mjs";
import { assertDevDatabase, readEnvFile } from "./video-demo/entorno.mjs";
import { chequear } from "./video-demo/preflight.mjs";
import { ESCALAS, TAMANOS, grabar } from "./video-demo/recorrido.mjs";
import { PRODUCTION_SUPABASE } from "../smaalacarta/web/apps/menu-app/lib/supabase-env.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ADMIN = path.join(RAIZ, "smaalacarta", "admin");

function salirConError(mensajes) {
  console.error(["", ...[].concat(mensajes).map((m) => `✗ ${m}`), ""].join("\n"));
  process.exit(1);
}

function fechaHora(fecha = new Date()) {
  const dos = (n) => String(n).padStart(2, "0");
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}_${dos(fecha.getHours())}-${dos(fecha.getMinutes())}-${dos(fecha.getSeconds())}`;
}

const args = new Set(process.argv.slice(2));
const env = { ...readEnvFile(path.join(ADMIN, ".env.local")) };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

// Solo la base dev: se niega con la de producción, sea cual sea el modo.
try {
  const prod = readEnvFile(path.join(ADMIN, ".env.local.prod"));
  assertDevDatabase(url, [prod.NEXT_PUBLIC_SUPABASE_URL, PRODUCTION_SUPABASE.url]);
} catch (error) {
  salirConError(error.message);
}

const faltan = [
  ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", key],
  ["SUPABASE_SERVICE_ROLE_KEY", serviceKey],
]
  .filter(([, valor]) => !valor)
  .map(([nombre]) => nombre);
if (faltan.length) salirConError(`Faltan en admin/.env.local: ${faltan.join(", ")}.`);

if (args.has("--borrar")) {
  try {
    await borrarDemo({ url, serviceKey });
  } catch (error) {
    salirConError(error.message);
  }
  process.exit(0);
}

const cuentas = {
  localEmail: env.DEMO_LOCAL_EMAIL,
  localPassword: env.DEMO_LOCAL_PASSWORD,
  repartidorEmail: env.DEMO_REPARTIDOR_EMAIL,
  repartidorPassword: env.DEMO_REPARTIDOR_PASSWORD,
};
const sinCuenta = ["DEMO_LOCAL_EMAIL", "DEMO_LOCAL_PASSWORD", "DEMO_REPARTIDOR_EMAIL", "DEMO_REPARTIDOR_PASSWORD"].filter(
  (nombre) => !env[nombre],
);
if (sinCuenta.length) salirConError(`Cargá en admin/.env.local: ${sinCuenta.join(", ")}.`);

console.log("Chequeando que todo esté listo…");
const { problemas, datos } = await chequear({
  url,
  key,
  serviceKey,
  cuentas,
  otrosRepartidores: args.has("--permitir-otros-repartidores"),
});
if (problemas.length) {
  console.error(["", "No puedo grabar todavía:", ...problemas.map((p) => `  ✗ ${p}`), ""].join("\n"));
  process.exit(1);
}

if (spawnSync("ffmpeg", ["-version"]).status !== 0) salirConError("Falta ffmpeg: la grabación se codifica con él.");

const salida = path.join(RAIZ, "video-demo", "salida", fechaHora());
await mkdir(salida, { recursive: true });
console.log(`Grabando en ${path.relative(RAIZ, salida)} (no toques las ventanas)…`);

const { registro, videos, error, barraOculta } = await grabar({ salida, supabase: { url, key }, serviceKey, cuentas, datos });

await writeFile(
  path.join(salida, "pasos.json"),
  JSON.stringify(
    {
      generado: new Date().toISOString(),
      completo: !error,
      error: error ? error.message : null,
      nota: "Segundos desde el inicio de cada video. El video arranca al crearse su página: puede haber ~0,2 s de diferencia. Los pasos empiezan cuando las tres pantallas ya cargaron; inicio_util es el segundo de cada video desde el que ya hay imagen (lo anterior se recorta). Los focos son rectángulos en píxeles del video (x, y, ancho, alto); t es el segundo en que importan.",
      resolucion: { escala: ESCALAS, videos: Object.fromEntries(Object.entries(TAMANOS).map(([n, { width, height }]) => [n, `${width}x${height}`])) },
      inicio_util: registro?.inicioUtil ?? {},
      barra_de_avisos_oculta: Boolean(barraOculta),
      latencias: registro?.latencias ?? [],
      pasos: registro?.pasos ?? [],
    },
    null,
    2,
  ),
);

if (error) {
  console.error(`\n✗ ${error.message}\nLos videos hasta ahí, pasos.json y la carpeta fallo/ (capturas, HTML, pedido en la base y trace) quedaron en ${path.relative(RAIZ, salida)}.`);
  process.exit(1);
}
console.log(`\nListo. Videos y pasos.json en ${path.relative(RAIZ, salida)}.`);
console.log("Los pedidos demo quedan en la base: `npm run video-demo -- --borrar` los elimina.");
