// @vitest-environment node
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { decryptSecret, encryptSecret, KEY_VERSION } from "./crypto";

// MP-12: los tokens se cifran con AES-256-GCM, atados al negocio, y la clave del entorno falla cerrado.
const BUSINESS = "a1a1a1a1-0000-0000-0000-000000000001";
const OTHER = "b2b2b2b2-0000-0000-0000-000000000002";
const KEY = randomBytes(32).toString("base64");

beforeEach(() => {
  vi.stubEnv("MP_TOKEN_ENCRYPTION_KEY", KEY);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("cifrado de tokens — MP-12", () => {
  it("descifra lo que cifró, con la versión de la clave", () => {
    const sealed = encryptSecret("APP_USR-token-de-prueba", BUSINESS);

    expect(sealed.keyVersion).toBe(KEY_VERSION);
    expect(sealed.value).not.toContain("APP_USR");
    expect(decryptSecret(sealed.value, BUSINESS, sealed.keyVersion)).toBe("APP_USR-token-de-prueba");
  });

  it("dos cifrados del mismo texto dan salidas distintas (IV aleatorio)", () => {
    const a = encryptSecret("mismo", BUSINESS);
    const b = encryptSecret("mismo", BUSINESS);

    expect(a.value).not.toBe(b.value);
  });

  it("con otra clave no descifra", () => {
    const sealed = encryptSecret("secreto", BUSINESS);
    vi.stubEnv("MP_TOKEN_ENCRYPTION_KEY", randomBytes(32).toString("base64"));

    expect(() => decryptSecret(sealed.value, BUSINESS, sealed.keyVersion)).toThrow();
  });

  it("con otro business_id no descifra: el token queda atado a su negocio", () => {
    const sealed = encryptSecret("secreto", BUSINESS);

    expect(() => decryptSecret(sealed.value, OTHER, sealed.keyVersion)).toThrow();
  });

  it("un texto alterado no descifra", () => {
    const sealed = encryptSecret("secreto", BUSINESS);
    const bytes = Buffer.from(sealed.value, "base64url");
    bytes[bytes.length - 1] ^= 1;

    expect(() => decryptSecret(bytes.toString("base64url"), BUSINESS, sealed.keyVersion)).toThrow();
  });

  it("un texto demasiado corto no descifra", () => {
    expect(() => decryptSecret("abc", BUSINESS, KEY_VERSION)).toThrow();
  });

  it("una versión de clave desconocida no descifra", () => {
    const sealed = encryptSecret("secreto", BUSINESS);

    expect(() => decryptSecret(sealed.value, BUSINESS, KEY_VERSION + 1)).toThrow(/versi/i);
  });
});

describe("la clave del entorno falla cerrado", () => {
  it("sin clave lanza un error claro", () => {
    vi.stubEnv("MP_TOKEN_ENCRYPTION_KEY", "");

    expect(() => encryptSecret("x", BUSINESS)).toThrow(/MP_TOKEN_ENCRYPTION_KEY/);
  });

  it("con un largo incorrecto lanza un error que no imprime la clave", () => {
    const short = randomBytes(16).toString("base64");
    vi.stubEnv("MP_TOKEN_ENCRYPTION_KEY", short);

    let message = "";
    try {
      encryptSecret("x", BUSINESS);
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toMatch(/32 bytes/);
    expect(message).not.toContain(short);
  });
});
