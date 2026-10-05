import { cookies } from "next/headers";

import { BASE_PATH } from "@/lib/base-path";

import { RECOVERY_COOKIE, verifyRecovery } from "./recovery-session";

// ¿La sesión de este usuario vino de un link de recuperación? (ADMIN-AUTH-13 y 14). Lee la marca que
// dejó /auth/callback; sin clave en el servidor, o con una marca que no es de este usuario, no.
export async function hasRecoverySession(userId: string) {
  const mark = (await cookies()).get(RECOVERY_COOKIE)?.value;
  return verifyRecovery(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", mark, userId);
}

// La marca sirve para una sola contraseña nueva: al guardarla se borra (mismo path con que se creó).
export async function clearRecoverySession() {
  (await cookies()).delete({ name: RECOVERY_COOKIE, path: BASE_PATH });
}
