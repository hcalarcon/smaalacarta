import { fetchBusinessPdf, resolvePdf, resolvePdfTarget } from "./lib/pdf.js";
import { SUPABASE } from "/apps/menu-app/supabase-config.js";

async function fetchJSON(path) {
  try {
    const res = await fetch(path);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function init() {
  const target = resolvePdfTarget(window.location);

  const result = await resolvePdf(target, {
    fetchRemote: (slug, viaPath) => fetchBusinessPdf({ ...SUPABASE, slug, viaPath }),
    fetchJSON,
  });

  if (!result) {
    document.title = "Menú no encontrado";
    document.body.innerHTML = "<h1>No encontramos este menú.</h1>";
    return;
  }

  document.title = result.title;
  document.getElementById("pdfViewer").src = result.url;
}

init();
