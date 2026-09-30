// Captura las demos reales y las deja en WebP liviano dentro de landing/assets.
// Uso: npm run capture-demos  (requiere: npx playwright install chromium)
import { chromium } from "playwright";
import sharp from "sharp";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../smaalacarta/landing/assets",
);
const ESTILOS = ["moderno", "clasico", "minimal"];
const MAX_KB = 70;
const MIN_CALIDAD = 60;

const perfiles = {
  celular: {
    context: {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      locale: "es-AR",
    },
    ancho: 780,
    ruta: "/",
    archivo: (e) => `${e}.webp`,
  },
  menu: {
    context: {
      viewport: { width: 1170, height: 1200 },
      deviceScaleFactor: 1,
      locale: "es-AR",
    },
    ancho: 900,
    ruta: "/menu.html",
    archivo: (e) => `menu-${e}.webp`,
  },
};

async function capturar(browser, perfil, estilo) {
  const url = `https://${estilo}.smaalacarta.com.ar${perfil.ruta}`;
  const context = await browser.newContext(perfil.context);
  const page = await context.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(`error de página: ${e.message}`));
  try {
    const resp = await page.goto(url, { waitUntil: "networkidle" });
    if (!resp || !resp.ok()) {
      errores.push(`HTTP ${resp ? resp.status() : "sin respuesta"}`);
    }
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.scrollTo(0, 0));
    const texto = await page.evaluate(() => document.body.innerText);
    if (/\b(cerrado|closed)\b/i.test(texto)) {
      errores.push('el texto visible contiene "Cerrado"/"Closed"');
    }
    if (errores.length) throw new Error(`${url}: ${errores.join("; ")}`);
    return await page.screenshot({ type: "png" });
  } finally {
    await context.close();
  }
}

async function aWebp(png, ancho) {
  for (let calidad = 80; calidad >= MIN_CALIDAD; calidad -= 5) {
    const buf = await sharp(png)
      .resize({ width: ancho })
      .webp({ quality: calidad, effort: 6 })
      .toBuffer();
    if (buf.length <= MAX_KB * 1024 || calidad === MIN_CALIDAD) {
      return { buf, calidad };
    }
  }
}

const browser = await chromium.launch();
const resultados = [];
try {
  // Todo se captura antes de escribir: si una demo falla, no queda nada a medias.
  for (const perfil of Object.values(perfiles)) {
    for (const estilo of ESTILOS) {
      const png = await capturar(browser, perfil, estilo);
      resultados.push({
        archivo: perfil.archivo(estilo),
        ...(await aWebp(png, perfil.ancho)),
      });
    }
  }
} catch (e) {
  console.error(`Captura abortada, no se escribió nada.\n${e.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}

if (!process.exitCode) {
  await mkdir(OUT, { recursive: true });
  const filas = [];
  for (const { archivo, buf, calidad } of resultados) {
    await writeFile(path.join(OUT, archivo), buf);
    const { width, height } = await sharp(buf).metadata();
    const kb = ((await stat(path.join(OUT, archivo))).size / 1024).toFixed(1);
    filas.push({ archivo, tamaño: `${width}x${height}`, KB: kb, calidad });
    if (kb > MAX_KB) console.warn(`${archivo} pesa ${kb} KB (> ${MAX_KB}) con calidad mínima`);
  }
  console.table(filas);
}
