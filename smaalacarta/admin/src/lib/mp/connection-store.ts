import "server-only";

import type { createAdminClient } from "@/lib/supabase-admin";

import type { ConnectionRecord, ConnectionStore } from "./credentials";

// El almacén real de `credentials.ts`: `payment_connections` con la clave de servicio. Cada escritura es un
// solo `UPDATE … WHERE … RETURNING`, comparando contra el `refresh_token` cifrado que se leyó (MP-20).
export function createConnectionStore(supabase: ReturnType<typeof createAdminClient>): ConnectionStore {
  const table = () => supabase.from("payment_connections");

  return {
    async find(businessId) {
      const { data, error } = await table()
        .select("mp_user_id, access_token_enc, refresh_token_enc, key_version, expires_at, status")
        .eq("business_id", businessId)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) return null;

      return {
        mpUserId: Number(data.mp_user_id),
        accessTokenEnc: data.access_token_enc,
        refreshTokenEnc: data.refresh_token_enc,
        keyVersion: data.key_version,
        expiresAt: data.expires_at ? new Date(data.expires_at) : null,
        status: data.status as ConnectionRecord["status"],
      };
    },

    async acquireLease(businessId, refreshTokenEnc, now, until) {
      const { data, error } = await table()
        .update({ refreshing_until: until.toISOString() })
        .eq("business_id", businessId)
        .eq("status", "connected")
        .eq("refresh_token_enc", refreshTokenEnc)
        .or(`refreshing_until.is.null,refreshing_until.lt.${now.toISOString()}`)
        .select("business_id");

      if (error) throw new Error(error.message);
      return (data?.length ?? 0) > 0;
    },

    async saveRenewed(businessId, refreshTokenEnc, next, now) {
      const { data, error } = await table()
        .update({
          access_token_enc: next.accessTokenEnc,
          refresh_token_enc: next.refreshTokenEnc,
          key_version: next.keyVersion,
          expires_at: next.expiresAt.toISOString(),
          refreshing_until: null,
          updated_at: now.toISOString(),
        })
        .eq("business_id", businessId)
        .eq("status", "connected")
        .eq("refresh_token_enc", refreshTokenEnc)
        .select("business_id");

      if (error) throw new Error(error.message);
      return (data?.length ?? 0) > 0;
    },

    async releaseLease(businessId, refreshTokenEnc) {
      const { error } = await table()
        .update({ refreshing_until: null })
        .eq("business_id", businessId)
        .eq("refresh_token_enc", refreshTokenEnc);

      if (error) throw new Error(error.message);
    },

    async markNeedsReconnect(businessId, refreshTokenEnc, now) {
      const { data, error } = await table()
        .update({ status: "needs_reconnect", refreshing_until: null, updated_at: now.toISOString() })
        .eq("business_id", businessId)
        .eq("status", "connected")
        .eq("refresh_token_enc", refreshTokenEnc)
        .select("business_id");

      if (error) throw new Error(error.message);
      return (data?.length ?? 0) > 0;
    },
  };
}
