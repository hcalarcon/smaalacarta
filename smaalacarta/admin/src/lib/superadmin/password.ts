import { randomInt } from "node:crypto";

export const TEMP_PASSWORD_LENGTH = 12;

// Sin 0/O ni 1/l/I: se lee y se dicta por WhatsApp o teléfono sin equivocarse.
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const ALL = UPPER + LOWER + DIGITS;

function pick(chars: string) {
  // `randomInt` es criptográficamente seguro y no tiene sesgo de módulo.
  return chars[randomInt(chars.length)];
}

// Contraseña temporal de un solo uso: la persona la cambia en su primer ingreso.
// Siempre lleva mayúscula, minúscula y número; el resto es al azar y se mezcla.
export function generateTempPassword() {
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS)];

  while (chars.length < TEMP_PASSWORD_LENGTH) {
    chars.push(pick(ALL));
  }

  // Fisher-Yates: que las tres obligatorias no queden siempre al principio.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}
