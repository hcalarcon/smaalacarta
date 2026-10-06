import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { SUPPORT_WHATSAPP_URL } from "./support-contact";

describe("contacto para restablecer la contraseña — ADMIN-AUTH-16", () => {
  it("es un link de WhatsApp al mismo número que usa la landing", () => {
    const landing = readFileSync(
      resolve(process.cwd(), "../landing/hola.html"),
      "utf8",
    );
    const phone = /api\.whatsapp\.com\/send\?phone=(\d+)/.exec(landing)?.[1];

    expect(phone).toBeTruthy();
    expect(SUPPORT_WHATSAPP_URL.startsWith("https://api.whatsapp.com/send?")).toBe(true);
    expect(new URL(SUPPORT_WHATSAPP_URL).searchParams.get("phone")).toBe(phone);
  });
});
