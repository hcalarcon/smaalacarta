// Variables de entorno y la guarda "solo contra la base dev" del video demo.
// Los valores se leen en tiempo de ejecución y nunca se imprimen.
import { existsSync, readFileSync } from "node:fs";

// Formato `CLAVE=valor` de los .env: comentarios con #, comillas opcionales, sin expansión.
export function parseEnv(text) {
  const env = {};
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, "");
    let value = line.slice(eq + 1).trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    env[key] = value;
  }
  return env;
}

export function readEnvFile(file) {
  return existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {};
}

function hostOf(url) {
  try {
    return new URL(String(url).trim()).host.toLowerCase();
  } catch {
    return null;
  }
}

// Se niega si falta la URL o si es la de producción (la de `.env.local.prod` o la fija del menú).
export function assertDevDatabase(url, prodUrls) {
  const host = hostOf(url);
  if (!host) {
    throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL en admin/.env.local (o no es una URL válida).");
  }
  for (const prod of prodUrls) {
    if (prod && hostOf(prod) === host) {
      throw new Error(
        "La base de admin/.env.local es la de PRODUCCIÓN (coincide con .env.local.prod o con la del menú). " +
          "El video demo solo corre contra tu base dev: no hice nada.",
      );
    }
  }
}

// Solo dígitos: "+54 9 0000 000036" y "5490000000036" son el mismo teléfono.
export const digits = (value) => String(value ?? "").replace(/\D/g, "");
