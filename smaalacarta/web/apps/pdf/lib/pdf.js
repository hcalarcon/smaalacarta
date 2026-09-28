// Qué PDF mostrar y de dónde (Etapa 6e, PDF-1 y PDF-2): primero a quién —un
// negocio real, por slug, o la demo fija—, después el PDF en sí: Supabase primero
// (`public_business_pdf`, no depende de si el negocio publicó su menú digital), el
// JSON local de siempre como respaldo.

import { resolveSlugFromPath, resolveTarget } from "../../menu-app/lib/hostname.js";

const DEMO_PDF = "/data/demos/demomenu.pdf";

// A quién pedirle el PDF: por subdominio (`<slug>.smaalacarta.com.ar/pdf`), igual
// que el menú interactivo, o por el path de la landing (`smaalacarta.com.ar/<slug>/pdf`,
// RUTAS-4) para un negocio sin `plan_completo` — ese caso corre en el navegador, que
// nunca deja el dominio de la landing (el rewrite es transparente), así que acá el
// slug sale del propio `pathname`, no de una query que nunca llega. Por último, el
// subdominio legado `demo.*` (sin nombre de demo: siempre la misma).
export function resolvePdfTarget({ hostname, search, pathname } = {}) {
  const target = resolveTarget({ hostname, search });
  if (target) return target;

  if (String(hostname ?? "").startsWith("demo.")) {
    return { type: "demo", slug: null, viaPath: false };
  }

  const fromPath = resolveSlugFromPath(pathname);
  if (fromPath) return { type: "cliente", slug: fromPath, viaPath: true };

  return null;
}

// Pide `public_business_pdf(slug)` a Supabase, sin sesión. `viaPath` avisa que se
// llegó por el path de la landing: la función exige `plan_pdf` y que el negocio no
// tenga `plan_completo` (RUTAS-4); por subdominio sigue el criterio de siempre
// (`active`). Devuelve null si no hay nada configurado, no hay PDF cargado, el plan
// no lo permite, o algo falla: ahí se cae al JSON local.
export async function fetchBusinessPdf({
  url,
  key,
  slug,
  viaPath = false,
  fetchImpl = globalThis.fetch,
}) {
  if (!url?.trim() || !key?.trim() || !slug) return null;

  const headers = { apikey: key, "Content-Type": "application/json" };
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;

  try {
    const res = await fetchImpl(
      `${url.trim().replace(/\/+$/, "")}/rest/v1/rpc/public_business_pdf`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ p_slug: slug, p_via_path: viaPath }),
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

  const remote = await fetchRemote(target.slug, target.viaPath);
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
