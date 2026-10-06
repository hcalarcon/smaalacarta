import type { NextRequest } from "next/server";

import { preflight, withDeps } from "@/lib/mp/http";
import { verifyPayment } from "@/lib/mp/service";

export const OPTIONS = preflight;

// GET /admin/api/mp/verify?code= (MP-5)
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  return withDeps(request, (deps) => verifyPayment(deps, { code }));
}
