import "server-only";

import { randomBytes } from "node:crypto";

import { createAdminClient } from "@/lib/supabase-admin";

import { createOAuthApi } from "./oauth-api";
import { SITE_ORIGIN, type OAuthDeps } from "./oauth";
import { createRateLimiter } from "./rate-limit";

// Una conexión nueva cada pocos segundos por negocio alcanza: es un botón, no un proceso (MP-10). Vive en la
// memoria de la instancia, así que en serverless es un freno aproximado, como el de `verify`.
const startLimiter = createRateLimiter(5000);

// Las dependencias reales de `oauth.ts`: la base con la clave de servicio (solo servidor; solo
// `payment_connections`, `mp_oauth_states` y la bandera de `businesses`) y la API real de Mercado Pago.
// Lanza si falta la clave de servicio. Las variables se leen al llamar, no al cargar el módulo.
export function buildOAuthDeps(): OAuthDeps {
  const supabase = createAdminClient();

  return {
    now: () => Date.now(),
    random: (bytes) => randomBytes(bytes),
    globalEnabled: process.env.MP_OAUTH_ENABLED === "true",
    // Opcional: si falta vale "false".
    testMode: process.env.MP_OAUTH_TEST_MODE === "true",
    clientId: process.env.MP_OAUTH_CLIENT_ID || null,
    clientSecret: process.env.MP_OAUTH_CLIENT_SECRET || null,
    siteOrigin: SITE_ORIGIN,

    async isBusinessEnabled(businessId) {
      const { data, error } = await supabase
        .from("businesses")
        .select("mp_oauth_enabled")
        .eq("id", businessId)
        .maybeSingle();

      if (error) throw new Error(error.message);
      return data?.mp_oauth_enabled === true;
    },

    allowStart: (businessId, now) => startLimiter.allow(businessId, now),

    async insertState(row) {
      const { error } = await supabase.from("mp_oauth_states").insert({
        state_hash: row.stateHash,
        business_id: row.businessId,
        user_id: row.userId,
        code_verifier_enc: row.codeVerifierEnc,
        expires_at: row.expiresAt.toISOString(),
      });

      if (error) throw new Error(error.message);
    },

    // Un solo UPDATE … WHERE used_at IS NULL AND expires_at > ahora RETURNING: validar y marcar usado es la
    // misma operación, sin ventana para reusar el state (MP-10).
    async consumeState(stateHash, now) {
      const { data, error } = await supabase
        .from("mp_oauth_states")
        .update({ used_at: now.toISOString() })
        .eq("state_hash", stateHash)
        .is("used_at", null)
        .gt("expires_at", now.toISOString())
        .select("business_id, user_id, code_verifier_enc")
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) return null;

      return {
        businessId: data.business_id,
        userId: data.user_id,
        codeVerifierEnc: data.code_verifier_enc,
      };
    },

    async findConnectionOwner(mpUserId) {
      const { data, error } = await supabase
        .from("payment_connections")
        .select("business_id")
        .eq("mp_user_id", mpUserId)
        .neq("status", "revoked")
        .maybeSingle();

      if (error) throw new Error(error.message);
      return data?.business_id ?? null;
    },

    async saveConnection(row) {
      const now = new Date().toISOString();
      const { error } = await supabase.from("payment_connections").upsert(
        {
          business_id: row.businessId,
          mp_user_id: row.mpUserId,
          access_token_enc: row.accessTokenEnc,
          refresh_token_enc: row.refreshTokenEnc,
          key_version: row.keyVersion,
          expires_at: row.expiresAt.toISOString(),
          scope: row.scope,
          status: "connected",
          connected_by: row.connectedBy,
          connected_at: now,
          updated_at: now,
        },
        { onConflict: "business_id" },
      );

      if (error) throw new Error(error.message);
    },

    async revokeConnection(businessId) {
      const { error } = await supabase
        .from("payment_connections")
        .update({
          status: "revoked",
          access_token_enc: null,
          refresh_token_enc: null,
          expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("business_id", businessId);

      if (error) throw new Error(error.message);
    },

    mp: createOAuthApi(),
  };
}
