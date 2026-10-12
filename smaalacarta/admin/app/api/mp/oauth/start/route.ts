import type { NextRequest } from "next/server";

import { startOAuth } from "@/lib/mp/oauth";
import { withOAuth } from "@/lib/mp/oauth-http";

// POST /admin/api/mp/oauth/start (MP-9, MP-10, MP-11, MP-15): devuelve la URL de autorización. Solo POST:
// Next responde 405 a cualquier otro método.
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  return withOAuth((deps, actor) => startOAuth(deps, actor, { origin }));
}
