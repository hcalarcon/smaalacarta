// Prueba de humo de la vitrina, en texto y sin capturas (`npm run vitrina:humo`): sirve web/ con las
// rutas de /vitrina, simula la base con un menú completo y revisa, en un celular de 360 px y con y sin
// "reducir movimiento", que no haya errores de consola ni desborde horizontal, que cada tema pinte
// productos y que el cambio de idioma y el botón de WhatsApp funcionen. Hace falta Chromium de Playwright.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const raiz = fileURLToPath(new URL("../smaalacarta/web", import.meta.url));

const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
const servidor = createServer((req, res) => {
  let ruta = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const tema = ruta.match(/^\/vitrina\/(arcade|floral|futurista|natural|fantasia)$/);
  if (ruta === "/vitrina") ruta = "/apps/vitrina/index.html";
  else if (tema) ruta = `/apps/vitrina/${tema[1]}/index.html`;
  const archivo = join(raiz, ruta);
  if (!existsSync(archivo) || !statSync(archivo).isFile()) {
    res.writeHead(404).end("no");
    return;
  }
  res.writeHead(200, { "content-type": TIPOS[extname(archivo)] ?? "application/octet-stream" }).end(readFileSync(archivo));
});
await new Promise((ok) => servidor.listen(0, ok));
const base = `http://localhost:${servidor.address().port}`;

const item = (nombre, precio, extra = {}) => ({ nombre, descripcion: `Rico ${nombre.toLowerCase()} de la casa`, precio, imagen: "https://images.pexels.com/x.jpg", ...extra });
const MENU = {
  config: { nombre: "Santa Julia Resto", telefono: "5493644277105", horarios: {}, colores: {} },
  menu: {
    categorias: [
      { nombre: "Entradas", nombre_en: "Starters", items: [item("Empanadas", 2500), item("Provoleta", 7800)] },
      { nombre: "Hamburguesas", nombre_en: "Burgers", items: [
        item("Santa Julia", 26900, { destacado: true, nombre_en: "Santa Julia", opciones: [{ nombre: "Guarnición", min: 1, max: 1, opciones: [{ nombre: "Papas", precio: 0 }, { nombre: "Puré", precio: 500 }] }] }),
        item("Clásica", 18000, { agotado: true }),
      ] },
      { nombre: "Pizzas", items: [item("Muzza", 12000), item("Fugazza", 13000)] },
      { nombre: "Pastas", items: [item("Ñoquis", 14000)] },
      { nombre: "Postres", items: [item("Flan", 6500)] },
      { nombre: "Bebidas", items: [item("Agua", 2000), item("Cerveza", 4500)] },
    ],
  },
};

const navegador = await chromium.launch();
let fallos = 0;
for (const [ruta, sel] of [["/vitrina", ".tarjeta"], ["/vitrina/arcade", ".prod"], ["/vitrina/floral", ".plato"], ["/vitrina/futurista", ".ficha"], ["/vitrina/natural", ".postal"], ["/vitrina/fantasia", ".provision"]]) {
  for (const calmo of [false, true]) {
    const contexto = await navegador.newContext({ viewport: { width: 360, height: 740 }, reducedMotion: calmo ? "reduce" : "no-preference", locale: "es-AR" });
    const pagina = await contexto.newPage();
    const errores = [];
    pagina.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`));
    pagina.on("console", (m) => m.type() === "error" && !/Failed to load resource|ERR_/.test(m.text()) && errores.push(`console: ${m.text()}`));
    await pagina.route(/supabase\.co\/rest\/v1\/rpc\/public_menu/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MENU) }));
    await pagina.route(/pexels|googleapis|gstatic|logo\.png/, (r) => r.abort());
    await pagina.route(/\/api\/supabase-config/, (r) => r.fulfill({ status: 404, body: "" }));
    await pagina.goto(base + ruta, { waitUntil: "load" });
    await pagina.waitForTimeout(600);

    // Pasar la puerta de entrada de los temas que la tienen.
    for (const boton of ["#empezar", "#abrir"]) {
      if (await pagina.$(boton)) {
        await pagina.click(boton);
        await pagina.waitForTimeout(calmo ? 300 : 3500);
      }
    }
    const cantidad = (await pagina.$$(sel)).length;
    const desborde = await pagina.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    let extra = "";
    if (ruta !== "/vitrina") {
      await pagina.click('[data-idiomas] [data-lang="en"]');
      await pagina.waitForTimeout(300);
      const lang = await pagina.evaluate(() => document.documentElement.lang);
      const enlaces = await pagina.$$eval('a[href^="#cat-"]', (a) => a.length);
      extra = ` lang=${lang} enlaces=${enlaces}`;
      if (lang !== "en") errores.push("el idioma no cambió");
      const wa = await pagina.$eval(".vitrina-barra-quiero", (a) => a.href);
      if (!wa.includes("5493644277105")) errores.push("WhatsApp mal");
    }
    const bien = errores.length === 0 && cantidad > 0 && desborde <= 0;
    if (!bien) fallos += 1;
    console.log(`${bien ? "OK  " : "FALLA"} ${ruta} ${calmo ? "[calmo]" : "       "} items=${cantidad} desborde=${desborde}${extra}${errores.length ? " " + errores.join(" | ") : ""}`);
    await contexto.close();
  }
}
await navegador.close();
servidor.close();
process.exit(fallos ? 1 : 0);
