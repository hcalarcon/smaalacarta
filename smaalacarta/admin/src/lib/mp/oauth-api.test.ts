// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { MpApiError } from "./api";
import { MP_ME_URL, MP_TOKEN_URL } from "./oauth";
import { createOAuthApi } from "./oauth-api";

// El cliente de OAuth de Mercado Pago (MP-11, MP-16): qué manda y qué hace con los fallos.
const input = {
  clientId: "123",
  clientSecret: "SECRETO",
  code: "TG-CODE",
  redirectUri: "https://www.smaalacarta.com.ar/admin/api/mp/oauth/callback",
  codeVerifier: "VERIFIER",
  testToken: false,
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("exchangeCode", () => {
  it("manda el canje por POST con el code_verifier y sin test_token", async () => {
    const fetcher = vi.fn(async () => json({ access_token: "a" }));
    const r = await createOAuthApi(fetcher as unknown as typeof fetch).exchangeCode(input);

    expect(r).toEqual({ access_token: "a" });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(MP_TOKEN_URL);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      grant_type: "authorization_code",
      client_id: "123",
      client_secret: "SECRETO",
      code: "TG-CODE",
      redirect_uri: input.redirectUri,
      code_verifier: "VERIFIER",
    });
  });

  it("manda test_token=true solo en modo de prueba", async () => {
    const fetcher = vi.fn(async () => json({}));
    await createOAuthApi(fetcher as unknown as typeof fetch).exchangeCode({ ...input, testToken: true });

    const init = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(init.body as string).test_token).toBe(true);
  });

  it("un fallo lleva solo el código HTTP, no el cuerpo", async () => {
    const fetcher = vi.fn(async () => json({ message: "code SECRETO inválido" }, 400));
    const error = await createOAuthApi(fetcher as unknown as typeof fetch)
      .exchangeCode(input)
      .catch((e) => e);

    expect(error).toBeInstanceOf(MpApiError);
    expect(error.status).toBe(400);
    expect(error.message).not.toContain("SECRETO");
  });

  it("una respuesta que no es JSON es un fallo, no un valor vacío", async () => {
    const fetcher = vi.fn(async () => new Response("<html>", { status: 200 }));
    await expect(createOAuthApi(fetcher as unknown as typeof fetch).exchangeCode(input)).rejects.toBeInstanceOf(
      MpApiError,
    );
  });
});

describe("getMe", () => {
  it("consulta users/me con el token del negocio", async () => {
    const fetcher = vi.fn(async () => json({ id: 7, site_id: "MLA" }));
    const r = await createOAuthApi(fetcher as unknown as typeof fetch).getMe("APP_USR-1");

    expect(r).toEqual({ id: 7, site_id: "MLA" });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(MP_ME_URL);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer APP_USR-1");
  });
});
