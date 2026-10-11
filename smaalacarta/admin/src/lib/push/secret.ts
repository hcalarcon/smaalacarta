import { createHash, timingSafeEqual } from "node:crypto";

// Compara el encabezado `x-webhook-secret` con el secreto configurado en tiempo constante
// (ADMIN-PWA-17). Se comparan los hashes para que el largo del secreto tampoco se filtre.
// Sin secreto configurado o sin encabezado nunca coincide: una variable que falta no deja pasar a nadie.
export function secretMatches(received: string | null | undefined, expected: string | null | undefined): boolean {
  if (!received || !expected) return false;

  const a = createHash("sha256").update(received).digest();
  const b = createHash("sha256").update(expected).digest();

  return timingSafeEqual(a, b);
}
