import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

function archivosJs(carpeta) {
  return readdirSync(carpeta, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = join(carpeta, entrada.name);
    if (entrada.isDirectory()) return archivosJs(ruta);
    return entrada.name.endsWith(".js") && !entrada.name.endsWith(".test.js") ? [ruta] : [];
  });
}

// Los `tema.js` y `arranque.js` solo corren en el navegador y ningún otro test los importa: un error de
// sintaxis los dejaría en blanco sin que nada se entere.
describe("módulos de la vitrina", () => {
  it.each(archivosJs(raiz).map((ruta) => [ruta.slice(raiz.length + 1).replaceAll("\\", "/"), ruta]))(
    "%s tiene sintaxis válida",
    (_nombre, ruta) => {
      expect(() => execFileSync(process.execPath, ["--check", ruta], { stdio: "pipe" })).not.toThrow();
    },
  );
});
