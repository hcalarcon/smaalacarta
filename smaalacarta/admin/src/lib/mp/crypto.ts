import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Cifrado de los tokens de Mercado Pago de cada negocio (MP-12): AES-256-GCM con la clave de
// `MP_TOKEN_ENCRYPTION_KEY` (32 bytes en base64). El `business_id` va como dato asociado autenticado: un
// token copiado a la fila de otro negocio no descifra. El IV es nuevo en cada mensaje.
//
// Formato guardado: base64url(IV ‖ etiqueta ‖ texto cifrado). `KEY_VERSION` queda al lado en la base
// (`key_version`) para poder rotar la clave sin perder lo ya guardado.
export const KEY_VERSION = 1;

const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

// Se lee al llamar, no al cargar el módulo, para que el build no la necesite. Falla cerrado y el error
// nunca incluye la clave.
function loadKey(): Buffer {
  const raw = process.env.MP_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("Falta MP_TOKEN_ENCRYPTION_KEY: no se pueden cifrar los tokens.");

  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error("MP_TOKEN_ENCRYPTION_KEY tiene que ser de 32 bytes en base64.");
  }

  return key;
}

export function encryptSecret(plaintext: string, businessId: string): { value: string; keyVersion: number } {
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(businessId, "utf8"));
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return {
    value: Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url"),
    keyVersion: KEY_VERSION,
  };
}

export function decryptSecret(value: string, businessId: string, keyVersion: number): string {
  if (keyVersion !== KEY_VERSION) throw new Error("Versión de clave de cifrado desconocida.");

  const key = loadKey();
  const bytes = Buffer.from(value, "base64url");
  if (bytes.length < IV_BYTES + TAG_BYTES) throw new Error("Texto cifrado inválido.");

  const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, IV_BYTES));
  decipher.setAAD(Buffer.from(businessId, "utf8"));
  decipher.setAuthTag(bytes.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));

  try {
    return Buffer.concat([decipher.update(bytes.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString("utf8");
  } catch {
    // El mensaje original de Node no agrega nada útil y no hay que arrastrar datos del texto.
    throw new Error("No se pudo descifrar: clave, negocio o texto no coinciden.");
  }
}
