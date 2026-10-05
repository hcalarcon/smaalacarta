import { createHmac, timingSafeEqual } from "node:crypto";

// Sesión de recuperación (ADMIN-AUTH-13 y 14): quien llega a /restablecer desde el link de un mail de
// recuperación no recuerda su contraseña, así que ahí no se pide la actual. La sesión que abre el link
// es la prueba de identidad, pero una sesión normal no tiene que poder saltearse la contraseña actual
// entrando a /restablecer. Por eso /auth/callback, al canjear un link de recuperación, deja una marca
// corta: `<usuario>.<vencimiento>.<firma>`, firmada con una clave que solo conoce el servidor, atada a
// ese usuario. No se elige el `amr` del JWT (recovery/otp) porque no se puede comprobar acá qué valor
// pone Supabase en el flujo PKCE; la marca firmada no depende de eso.
export const RECOVERY_COOKIE = "sma-recovery";
export const RECOVERY_MAX_AGE_SECONDS = 15 * 60;

const signature = (secret: string, userId: string, expiresAt: number) =>
  createHmac("sha256", secret).update(`recovery:${userId}:${expiresAt}`).digest("hex");

export function signRecovery(secret: string, userId: string, now = Date.now()) {
  if (!secret) throw new Error("Falta la clave del servidor para firmar la sesión de recuperación.");

  const expiresAt = now + RECOVERY_MAX_AGE_SECONDS * 1000;
  return `${userId}.${expiresAt}.${signature(secret, userId, expiresAt)}`;
}

export function verifyRecovery(
  secret: string,
  mark: string | null | undefined,
  userId: string,
  now = Date.now(),
) {
  if (!secret || !mark) return false;

  const parts = mark.split(".");
  if (parts.length !== 3) return false;

  const [markUser, expires, sig] = parts;
  const expiresAt = Number(expires);
  if (markUser !== userId || !Number.isFinite(expiresAt) || now >= expiresAt) return false;

  const expected = Buffer.from(signature(secret, userId, expiresAt));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
