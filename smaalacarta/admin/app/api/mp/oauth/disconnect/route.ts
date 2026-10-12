import type { NextRequest } from "next/server";

import { disconnectOAuth } from "@/lib/mp/oauth";
import { withOAuth } from "@/lib/mp/oauth-http";

// POST /admin/api/mp/oauth/disconnect (MP-9, MP-14). Solo POST.
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  return withOAuth((deps, actor) => disconnectOAuth(deps, actor, { origin }));
}
