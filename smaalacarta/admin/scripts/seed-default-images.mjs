// Seed ampliado de imágenes predeterminadas (ADMIN-SUPER-26).
//
//   node scripts/seed-default-images.mjs            # descarga lo que falte y genera la migración
//   node scripts/seed-default-images.mjs --solo-sql # no descarga nada; arma la migración con los archivos que hay
//
// Para cada fila de TABLA:
//   - si `landing/assets/defaults/<archivo>.svg` no existe, lo baja de Noto Emoji (Apache 2.0), le saca el
//     prólogo XML y los comentarios, y lo guarda ahí. Un 404 omite la fila (se lista al final, no se inventa
//     un reemplazo);
//   - suma la fila a una migración de seed en `supabase/migrations/`, idempotente (`ON CONFLICT`). Una fila
//     con entrada propia en ENTRADAS suma sus palabras clave a esa entrada que ya estaba en el seed
//     anterior; el resto crea una entrada nueva con prioridad 0.
//
// Las palabras clave se escriben sin tildes ni signos; la base las normaliza al guardar (trigger
// `default_images_normalize`, con `normalize_words`). Las frases de varias palabras ganan por especificidad
// en `suggest_default_image`.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const DIR_IMAGENES = path.resolve(AQUI, "../../landing/assets/defaults");
export const DIR_MIGRACIONES = path.resolve(AQUI, "../supabase/migrations");
const BASE_NOTO = "https://raw.githubusercontent.com/googlefonts/noto-emoji/main/2D/svg";
const BASE_IMAGEN = "https://www.smaalacarta.com.ar/assets/defaults";
const SUFIJO_MIGRACION = "seed_imagenes_predeterminadas_ampliado.sql";

// slug | código Unicode (Noto Emoji) | palabras clave
export const TABLA = `
hamburguesa | 1f354 | hamburguesa, burger, hamburguesa completa, cheeseburger
pizza | 1f355 | pizza, muzzarella, muzzarela, fugazzeta, napolitana pizza, calabresa, margarita
focaccia | 1fad3 | focaccia, foccacia, fugazza, pan plano
pancho | 1f32d | pancho, hot dog, panchos, choripan, chorizo, salchicha
papas | 1f35f | papas fritas, papa frita, fritas, bastones, provenzal, cheddar y panceta papas
sandwich | 1f96a | sandwich, sanguche, lomito, tostado, miga, milanesa sandwich, pan relleno
taco | 1f32e | taco, tacos, nachos, quesadilla
wrap | 1f32f | wrap, burrito, enrollado, shawarma, kebab
empanada | 1f95f | empanada, empanadas, tarteleta pequena, pastelito, calzone
carne | 1f969 | bife, lomo, entrecot, asado de tira, vacio, ojo de bife, milanesa, milanesa napolitana, suprema, cuadril, carne
parrilla | 1f356 | parrilla, asado, costillas, choripanes parrilla, picada, chinchulin, morcilla
pollo | 1f357 | pollo, pata muslo, alitas, nuggets, supremas de pollo, pechuga
panceta | 1f953 | panceta, bacon, tocino, jamon crudo
huevo | 1f373 | huevo, huevos, revuelto, tortilla, omelette
pan | 1f35e | pan, pan casero, tostadas, pan de campo
medialuna | 1f950 | medialuna, medialunas, croissant, factura, facturas
baguette | 1f956 | baguette, pan frances, flautita, bagette
queso | 1f9c0 | queso, quesos, provoleta, muzzarella queso, tabla de quesos, fondue
ensalada | 1f957 | ensalada, ensaladas, bowl, verduras, vegetariano, vegano, caesar
pasta | 1f35d | pasta, pastas, fideos, tallarines, espagueti, spaghetti, noquis, ravioles, sorrentinos, canelones, lasagna, lasana
sopa | 1f35c | sopa, caldo, ramen, fideos orientales, wok
guiso | 1f372 | guiso, locro, cazuela, estofado, carbonada, puchero
arroz | 1f35b | arroz, risotto, curry, paella, arroz con pollo
sushi | 1f363 | sushi, roll, rolls, nigiri, sashimi, maki, temaki
combo | 1f371 | combo, box, bandeja, menu ejecutivo, promo almuerzo, tabla
rabas | 1f364 | rabas, langostinos, camarones, gambas, mariscos, fritura de mar
pescado | 1f41f | pescado, merluza, salmon, trucha, pejerrey, lenguado, filet de pescado
tarta | 1f967 | tarta, tartas, torta salada, quiche, pastel de papa, pastelera, pascualina
torta | 1f370 | torta, tortas, porcion de torta, cheesecake, lemon pie, tiramisu, brownie, chocotorta, rogel
cumple | 1f382 | torta de cumpleanos, torta decorada, torta personalizada
muffin | 1f9c1 | muffin, cupcake, magdalena, budin, bizcochuelo
dona | 1f369 | dona, donas, donut, berlinesa, bola de fraile
galletita | 1f36a | galletita, galletitas, cookie, cookies, alfajor, alfajores, pepas, vigilante
chocolate | 1f36b | chocolate, bombon, bombones, barra de chocolate
helado | 1f368 | helado, helados, gelato, kilo de helado, copa helada, sundae, bochas
cucurucho | 1f366 | cucurucho, cono, soft, helado de maquina
granizado | 1f367 | granizado, raspado, frozen, slush
flan | 1f36e | flan, flan con dulce de leche, postre, postres, panna cotta, budin de pan
miel | 1f36f | miel, dulce de leche, mermelada
panqueque | 1f95e | panqueque, panqueques, crepe, crepes, hotcakes
waffle | 1f9c7 | waffle, waffles
cafe | 2615 | cafe, cafes, cortado, capuchino, latte, lagrima, espresso, submarino, mocca
te | 1f375 | te, mate cocido, infusion, tisana, mate, chai
bubbletea | 1f9cb | bubble tea, te frio, boba, te helado
gaseosa | 1f964 | gaseosa, gaseosas, coca cola, pepsi, sprite, fanta, refresco, bebida, soda
jugo | 1f9c3 | jugo, jugos, exprimido, naranjada, limonada, licuado de frutas
leche | 1f95b | leche, licuado, malteada, batido, milkshake
cerveza | 1f37a | cerveza, cervezas, ipa, lager, stout, honey, pinta, chopp, artesanal
cervezas | 1f37b | tirada de cervezas, jarra de cerveza, pitcher, cervezas por tanda
vino | 1f377 | vino, vinos, malbec, tinto, blanco, rosado, copa de vino, cabernet
trago | 1f378 | trago, tragos, coctel, cocktail, fernet, gin tonic, aperol, campari, negroni, mojito
tropical | 1f379 | trago tropical, caipirinha, daiquiri, sangria, piña colada
espumante | 1f942 | espumante, champagne, brindis, sidra
whisky | 1f943 | whisky, wisky, ron, vodka, tequila, licor
agua | 1f4a7 | agua, agua mineral, agua con gas, agua sin gas, soda sifon
fruta | 1f34e | fruta, frutas, manzana, ensalada de frutas, postre de frutas
banana | 1f34c | banana, bananas, licuado de banana
frutilla | 1f353 | frutilla, frutillas, frutos rojos, arandanos, frambuesa
uva | 1f347 | uva, uvas, pasas
naranja | 1f34a | naranja, mandarina, pomelo
limon | 1f34b | limon, limonada, lima
sandia | 1f349 | sandia, melon
durazno | 1f351 | durazno, duraznos, damasco, ciruela
palta | 1f951 | palta, guacamole, avocado
tomate | 1f345 | tomate, tomates, caprese
zanahoria | 1f955 | zanahoria, zanahorias
papa | 1f954 | papa, papas, pure, puré, papas al horno, papas rusticas, pure de papas
choclo | 1f33d | choclo, humita, maiz, pochoclo con choclo
brocoli | 1f966 | brocoli, vegetales al vapor, verduras salteadas
hongos | 1f344 | hongos, champignones, portobello
batata | 1f360 | batata, camote
mani | 1f95c | mani, frutos secos, mix de frutos secos, almendras, nueces
pochoclo | 1f37f | pochoclo, popcorn, pop, snack
llevar | 1f961 | para llevar, take away, delivery, caja
cubiertos | 1f374 | plato del dia, menu del dia, especial, minuta, sugerencia, guarnicion
`;

// Archivo (sin .svg) cuando no se llama como el slug: o ya estaba en el seed anterior con otro nombre
// (mismo código), o el nombre ya lo ocupaba otro emoji y el nuevo no puede pisarlo.
export const ARCHIVOS = {
  pancho: "hot-dog",
  papas: "papas-fritas",
  wrap: "burrito",
  parrilla: "carne-hueso",
  guiso: "sopa", // la olla del guiso, que ya era `sopa.svg`
  combo: "bento",
  rabas: "camaron",
  galletita: "galleta",
  leche: "licuado",
  muffin: "cupcake",
  trago: "coctel",
  brocoli: "verduras",
  sopa: "ramen", // `sopa.svg` ya es otro emoji (la olla)
  te: "te-taza", // `te.svg` ya es otro emoji (la tetera)
  arroz: "arroz-curry", // `arroz.svg` ya es otro emoji (el arroz blanco)
};

// Entrada del seed anterior (`20261012000000_imagenes_predeterminadas.sql`) a la que se suman las claves de
// la fila, por nombre o por imagen. Con una entrada del seed anterior, la fila no inserta otra: la actualiza.
// Las filas que no están acá crean una entrada nueva, que se llama como NOMBRES_NUEVAS.
export const ENTRADAS = {
  hamburguesa: "Hamburguesa",
  pizza: "Pizza",
  focaccia: "Focaccia",
  pancho: "Choripán",
  papas: "Papas fritas",
  sandwich: "Sándwich",
  taco: "Tacos",
  wrap: "Burritos y wraps",
  empanada: "Empanada",
  carne: "Bife",
  parrilla: "Parrilla",
  pollo: "Pollo",
  panceta: "Cerdo y fiambres",
  huevo: "Huevo",
  pan: "Pan",
  medialuna: "Medialuna",
  baguette: "Baguette y tostadas",
  queso: "Queso",
  ensalada: "Ensalada",
  pasta: "Pasta",
  sopa: "Sopa",
  arroz: "Arroz",
  sushi: "Sushi",
  combo: "Combo",
  rabas: "Mariscos",
  pescado: "Pescado",
  tarta: "Tarta",
  torta: "Torta",
  muffin: "Cupcake y muffin",
  dona: "Donas y churros",
  galletita: "Alfajor",
  chocolate: "Chocolate",
  helado: "Helado",
  flan: "Flan y postres",
  panqueque: "Panqueque",
  waffle: "Waffle",
  cafe: "Café",
  te: "Té",
  gaseosa: "Gaseosa",
  jugo: "Jugo",
  leche: "Licuado",
  cerveza: "Cerveza",
  vino: "Vino",
  trago: "Cóctel",
  whisky: "Destilados",
  agua: "Agua",
  fruta: "Fruta",
  banana: "Banana",
  frutilla: "Frutilla",
  limon: "Limonada",
  tomate: "Tomate",
  papa: "Papa",
  choclo: "Choclo",
  brocoli: "Verduras",
  pochoclo: "Pochoclo",
};

export const NOMBRES_NUEVAS = {
  guiso: "Guiso",
  cumple: "Torta de cumpleaños",
  cucurucho: "Cucurucho",
  granizado: "Granizado",
  miel: "Miel y dulce de leche",
  bubbletea: "Bubble tea",
  cervezas: "Tirada de cervezas",
  tropical: "Trago tropical",
  espumante: "Espumante",
  uva: "Uva",
  naranja: "Naranja",
  sandia: "Sandía",
  durazno: "Durazno",
  palta: "Palta",
  zanahoria: "Zanahoria",
  hongos: "Hongos",
  batata: "Batata",
  mani: "Maní",
  llevar: "Para llevar",
  cubiertos: "Plato del día",
};

// Prioridad de las entradas nuevas que no entran con 0: la torta de cumpleaños (3 palabras de clave) tiene que
// ganarle a "torta" (1 palabra + prioridad 3 de la entrada Torta), y con 0 el puntaje no alcanza.
export const PRIORIDADES = { cumple: 2 };

/** Las filas de TABLA: { slug, codigo, keywords, archivo, entrada, nueva }. */
export function parseTabla(tabla = TABLA) {
  return tabla
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((linea) => {
      const [slug, codigo, claves] = linea.split("|").map((p) => p.trim());
      if (!slug || !/^[0-9a-f]{4,6}$/.test(codigo ?? "") || !claves) throw new Error(`Fila inválida: ${linea}`);
      const existente = ENTRADAS[slug];
      const nueva = NOMBRES_NUEVAS[slug];
      if (!existente === !nueva) throw new Error(`"${slug}" tiene que estar en ENTRADAS o en NOMBRES_NUEVAS, y solo en uno`);
      return {
        slug,
        codigo,
        keywords: claves.split(",").map((k) => k.trim()).filter(Boolean),
        archivo: ARCHIVOS[slug] ?? slug,
        entrada: existente ?? nueva,
        nueva: Boolean(nueva),
        prioridad: PRIORIDADES[slug] ?? 0,
      };
    });
}

/** Sin el prólogo XML ni los comentarios; termina en un salto de línea. */
export function limpiarSvg(texto) {
  return (
    texto
      .replace(/^﻿/, "")
      .replace(/<\?xml[\s\S]*?\?>/g, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .trim() + "\n"
  );
}

const sqlTexto = (s) => `'${s.replace(/'/g, "''")}'`;

/** Misma idea que `normalize_words` de la base, solo para detectar claves repetidas entre entradas nuevas. */
function aproximar(clave) {
  return clave
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** El SQL de la migración. `filas` ya sin las omitidas. */
export function armarMigracion(filas) {
  const destinos = filas.map((f) => f.entrada.toLowerCase());
  const repetido = destinos.find((d, i) => destinos.indexOf(d) !== i);
  if (repetido) throw new Error(`Dos filas apuntan a la misma entrada: "${repetido}"`);

  // Una clave que reclama una entrada nueva se le quita a las demás; si dos nuevas la reclamaran, se
  // quitarían entre sí y la clave se perdería.
  const reclamadas = new Map();
  for (const f of filas.filter((x) => x.nueva)) {
    for (const k of f.keywords.map(aproximar)) {
      if (reclamadas.has(k)) throw new Error(`La clave "${k}" la reclaman "${reclamadas.get(k)}" y "${f.entrada}"`);
      reclamadas.set(k, f.entrada);
    }
  }

  const nuevas = filas.filter((f) => f.nueva);
  const valores = filas.map(
    (f) =>
      `  (${sqlTexto(f.entrada)}, ARRAY[${f.keywords.map(sqlTexto).join(", ")}], '${BASE_IMAGEN}/${f.archivo}.svg', ${f.prioridad})`,
  );

  return `-- Seed ampliado de imágenes predeterminadas (ADMIN-SUPER-26). Generado por
-- \`admin/scripts/seed-default-images.mjs\`: no se edita a mano.
--
-- Parte de \`20261012000000_imagenes_predeterminadas.sql\` (el seed inicial) y de
-- \`20261014000000_imagenes_predeterminadas_nombre_unico.sql\` (la clave única por nombre):
-- - Una fila cuyo nombre ya existe suma sus palabras clave a esa entrada (\`ON CONFLICT\`) y deja
--   su prioridad. La imagen es la de la fila (la misma, salvo en las pocas entradas que cambian de emoji).
-- - Una fila nueva se inserta con prioridad 0 (salvo la torta de cumpleaños, que necesita 2). Sus palabras clave se le quitan a las demás entradas
--   para que no compitan con una más genérica con más prioridad.
-- - Las palabras clave se normalizan solas (trigger \`default_images_normalize\`).
-- - Se puede correr más de una vez: el resultado es el mismo.
INSERT INTO public.default_images (name, keywords, image_url, priority)
VALUES
${valores.join(",\n")}
ON CONFLICT (lower(name)) DO UPDATE
SET keywords = public.default_images.keywords || EXCLUDED.keywords,
    image_url = EXCLUDED.image_url;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT name, keywords
    FROM public.default_images
    WHERE lower(name) = ANY (ARRAY[${nuevas.map((f) => sqlTexto(f.entrada.toLowerCase())).join(", ")}])
  LOOP
    UPDATE public.default_images d
    SET keywords = ARRAY(SELECT k FROM unnest(d.keywords) AS k WHERE k <> ALL (r.keywords))
    WHERE lower(d.name) <> lower(r.name) AND d.keywords && r.keywords;
  END LOOP;
END
$$;
`;
}

/** Nombre del archivo de la migración: el de la que ya existe, o la siguiente fecha libre. */
export function nombreMigracion(archivos) {
  const existente = archivos.find((a) => a.endsWith(`_${SUFIJO_MIGRACION}`));
  if (existente) return { nombre: existente, existia: true };
  const ultima = archivos
    .map((a) => /^(\d{14})_/.exec(a)?.[1])
    .filter(Boolean)
    .sort()
    .at(-1);
  const d = new Date(Date.UTC(+ultima.slice(0, 4), +ultima.slice(4, 6) - 1, +ultima.slice(6, 8) + 1));
  const fecha = d.toISOString().slice(0, 10).replaceAll("-", "");
  return { nombre: `${fecha}000000_${SUFIJO_MIGRACION}`, existia: false };
}

const README = `# Imágenes predeterminadas de productos

Ilustraciones que el menú público muestra en un producto sin foto propia, elegidas por coincidencia con su nombre
(tabla \`default_images\`, ver \`docs/SPEC.md\`: ADMIN-SUPER-17 a 26 y PUBLICO-51 a 57).

## Atribución

Los archivos \`.svg\` son de **Noto Emoji** de Google (https://github.com/googlefonts/noto-emoji), licencia
**Apache 2.0** (el texto está en [\`LICENSE\`](LICENSE)). Se bajaron de \`2D/svg/emoji_u<código>.svg\` quitándoles el
prólogo XML y los comentarios, con \`admin/scripts/seed-default-images.mjs\`.
`;

async function main() {
  const soloSql = process.argv.includes("--solo-sql");
  const filas = parseTabla();
  mkdirSync(DIR_IMAGENES, { recursive: true });

  const omitidas = [];
  let bajadas = 0;
  for (const f of filas) {
    const destino = path.join(DIR_IMAGENES, `${f.archivo}.svg`);
    if (existsSync(destino)) continue;
    if (soloSql) {
      omitidas.push(`${f.slug} (${f.codigo}): falta ${f.archivo}.svg`);
      continue;
    }
    const url = `${BASE_NOTO}/emoji_u${f.codigo}.svg`;
    const r = await fetch(url);
    if (!r.ok) {
      omitidas.push(`${f.slug} (${f.codigo}): ${r.status} en ${url}`);
      continue;
    }
    writeFileSync(destino, limpiarSvg(await r.text()));
    bajadas++;
  }

  const licencia = path.join(DIR_IMAGENES, "LICENSE");
  if (!existsSync(licencia) && !soloSql) {
    const r = await fetch(`${BASE_NOTO}/LICENSE`);
    if (r.ok) writeFileSync(licencia, await r.text());
    else omitidas.push(`LICENSE: ${r.status}`);
  }
  const readme = path.join(DIR_IMAGENES, "README.md");
  if (!existsSync(readme)) writeFileSync(readme, README);

  const fuera = new Set(omitidas.map((o) => o.split(" ")[0]));
  const usadas = filas.filter((f) => !fuera.has(f.slug));
  const { nombre, existia } = nombreMigracion(readdirSync(DIR_MIGRACIONES));
  if (existia && !process.argv.includes("--regenerar")) {
    throw new Error(`Ya existe ${nombre}. Una migración aplicada no se edita: usá --regenerar solo si no llegó a main.`);
  }
  writeFileSync(path.join(DIR_MIGRACIONES, nombre), armarMigracion(usadas));

  console.log(`SVG bajados: ${bajadas}. Filas en la migración: ${usadas.length} de ${filas.length}. ${nombre}`);
  if (omitidas.length) console.log(`Omitidas:\n${omitidas.map((o) => `  - ${o}`).join("\n")}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
