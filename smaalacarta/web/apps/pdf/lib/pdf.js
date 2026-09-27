// Qué PDF mostrar y de dónde (Etapa 6e, PDF-1 y PDF-2): primero a quién —un
// negocio real, por slug, o la demo fija—, después el PDF en sí: Supabase primero
// (`public_business_pdf`, no depende de si el negocio publicó su menú digital), el
// JSON local de siempre como respaldo.

import { resolveBusinessFromHost } from "../../menu-app/lib/hostname.js";

const DEMO_PDF = "/data/demos/demomenu.pdf";

// A quién pedirle el PDF. El negocio va en el SUBDOMINIO (`<slug>.smaalacarta.com.ar/pdf`),
// igual que el menú interactivo y el seguimiento de pedidos: el dominio raíz
// (`smaalacarta.com.ar` y `www.`) es el sitio de la landing, no llega acá, así que
// una ruta con el negocio en el path (`/:cliente/pdf`) nunca funcionó en producción.
// Primero query (para probar en local, donde no hay subdominios ni los rewrites de
// `vercel.json`), después el subdominio, y por último el subdominio legado `demo.*`
// (sin nombre de demo: siempre la misma).
export function resolvePdfTarget({ hostname, search } = {}) {
  const params = new URLSearchParams(search ?? "");

  if (params.get("demo")) return { type: "demo", slug: params.get("demo") };
  if (params.get("cliente")) return { type: "cliente", slug: params.get("cliente") };

  const fromHost = resolveBusinessFromHost(hostname);
  if (fromHost) return fromHost;

  if (String(hostname ?? "").startsWith("demo.")) {
    return { type: "demo", slug: null };
  }

  return null;
}

// Pide `public_business_pdf(slug)` a Supabase, sin sesión. Devuelve null si no hay
// nada configurado, no hay PDF cargado, o algo falla: ahí se cae al JSON local.
export async function fetchBusinessPdf({ url, key, slug, fetchImpl = globalThis.fetch }) {
  if (!url?.trim() || !key?.trim() || !slug) return null;

  const headers = { apikey: key, "Content-Type": "application/json" };
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;

  try {
    const res = await fetchImpl(
      `${url.trim().replace(/\/+$/, "")}/rest/v1/rpc/public_business_pdf`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ p_slug: slug }),
        signal:
          typeof AbortSignal !== "undefined" && AbortSignal.timeout
            ? AbortSignal.timeout(8000)
            : undefined,
      },
    );

    if (!res.ok) return null;

    const data = await res.json();
    return data && typeof data.pdf === "string" && data.pdf ? data : null;
  } catch {
    return null;
  }
}

// El PDF y el título de pestaña listos para mostrar, o null si no hay nada.
// `fetchRemote` y `fetchJSON` se inyectan para poder probar esto sin red.
export async function resolvePdf(target, { fetchRemote, fetchJSON }) {
  if (!target) return null;

  if (target.type === "demo") {
    return { url: DEMO_PDF, title: "Menú demo" };
  }

  const remote = await fetchRemote(target.slug);
  if (remote) {
    return { url: remote.pdf, title: `Menú - ${remote.nombre}` };
  }

  const config = await fetchJSON(`/data/clientes/${target.slug}/config.json`);
  if (config?.pdf?.file) {
    return {
      url: `/data/clientes/${target.slug}/${config.pdf.file}`,
      title: `Menú - ${config.nombre ?? ""}`,
    };
  }

  return null;
}
