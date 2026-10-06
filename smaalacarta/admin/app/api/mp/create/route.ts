import type { NextRequest } from "next/server";

import { json, preflight, withDeps } from "@/lib/mp/http";
import { createPayment } from "@/lib/mp/service";

export const OPTIONS = preflight;

// POST /admin/api/mp/create (MP-3): recibe solo el código del pedido.
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(request, { status: 400, body: { error: "invalid_body" } });
  }

  const code = typeof body === "object" && body !== null ? (body as { code?: unknown }).code : undefined;
  return withDeps(request, (deps) => createPayment(deps, { code }));
}
