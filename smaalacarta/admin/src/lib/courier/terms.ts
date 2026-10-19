// Términos para repartidores (ENVIO-179 a 185). El texto y su número de versión viven en
// `src/content/terminos-repartidores.md`; la versión vigente la decide la base (`courier_terms_version()`), y un
// test comprueba que las dos coincidan. Reglas puras; el archivo se lee en `terms-file.ts` (solo servidor).

export type Terms = { version: number; body: string };

// Separa el encabezado `version: N` del texto. Un archivo sin versión válida es un error de quien lo editó.
export function parseTerms(raw: string): Terms {
  const match = /^---\r?\nversion:\s*(\d+)\s*\r?\n---\r?\n/.exec(raw);

  if (!match || Number(match[1]) < 1) {
    throw new Error("terminos-repartidores.md: falta `version: N` al principio");
  }

  return { version: Number(match[1]), body: raw.slice(match[0].length).trim() };
}

// Lo que dice la base de este repartidor (`courier_terms_status()`).
export type TermsStatus = {
  required: boolean;
  version: number;
  accepted: boolean;
  acceptedVersion: number | null;
  acceptedAt: string | null;
};

export function statusFromRow(row: unknown): TermsStatus {
  const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;

  return {
    required: r.required === true,
    version: typeof r.version === "number" ? r.version : 1,
    accepted: r.accepted === true,
    acceptedVersion: typeof r.accepted_version === "number" ? r.accepted_version : null,
    acceptedAt: typeof r.accepted_at === "string" ? r.accepted_at : null,
  };
}

// La pantalla de términos se muestra cuando se exigen y la versión vigente no está aceptada.
export function mustAccept(status: TermsStatus): boolean {
  return status.required && !status.accepted;
}

export type TermsLang = "es" | "en" | "pt";

// El idioma sale del navegador (`Accept-Language`); si no es inglés ni portugués, español.
export function pickLang(acceptLanguage: string | null | undefined): TermsLang {
  const first = (acceptLanguage ?? "").split(",")[0]?.trim().toLowerCase() ?? "";

  if (first.startsWith("pt")) return "pt";
  if (first.startsWith("en")) return "en";
  return "es";
}

// Los textos de la pantalla. Los términos en sí van solo en español.
export const TERMS_TEXTS: Record<
  TermsLang,
  {
    title: string;
    intro: string;
    check: string;
    accept: string;
    accepting: string;
    error: string;
    onlySpanish: string;
    profileLink: string;
    accepted: (version: number, date: string) => string;
    back: string;
  }
> = {
  es: {
    title: "Antes de empezar",
    intro: "Para ver y tomar pedidos, leé y aceptá los términos para repartidores.",
    check: "Leí y acepto los términos",
    accept: "Aceptar",
    accepting: "Guardando…",
    error: "No pudimos guardar tu aceptación. Probá de nuevo.",
    onlySpanish: "",
    profileLink: "Términos para repartidores",
    accepted: (version, date) => `Versión ${version}, aceptada el ${date}`,
    back: "Volver a Mi perfil",
  },
  en: {
    title: "Before you start",
    intro: "To see and take orders, read and accept the courier terms.",
    check: "I have read and accept the terms",
    accept: "Accept",
    accepting: "Saving…",
    error: "We couldn't save your acceptance. Please try again.",
    onlySpanish: "The terms are available in Spanish only.",
    profileLink: "Courier terms",
    accepted: (version, date) => `Version ${version}, accepted on ${date}`,
    back: "Back to My profile",
  },
  pt: {
    title: "Antes de começar",
    intro: "Para ver e pegar pedidos, leia e aceite os termos para entregadores.",
    check: "Li e aceito os termos",
    accept: "Aceitar",
    accepting: "Salvando…",
    error: "Não conseguimos salvar a sua aceitação. Tente de novo.",
    onlySpanish: "Os termos estão disponíveis apenas em espanhol.",
    profileLink: "Termos para entregadores",
    accepted: (version, date) => `Versão ${version}, aceita em ${date}`,
    back: "Voltar para Meu perfil",
  },
};

export type TermsBlock = { kind: "title"; text: string } | { kind: "item"; text: string };

// El texto de los términos es un título (`# …`) y una lista numerada; no hace falta un parser de Markdown.
export function termsBlocks(body: string): TermsBlock[] {
  const blocks: TermsBlock[] = [];

  for (const line of body.split(/\r?\n/)) {
    const title = /^#\s+(.+)$/.exec(line);
    const item = /^\d+\.\s+(.+)$/.exec(line);

    if (title) blocks.push({ kind: "title", text: title[1].trim() });
    else if (item) blocks.push({ kind: "item", text: item[1].trim() });
  }

  return blocks;
}

// La fecha de la aceptación, en hora argentina.
export function formatAcceptedAt(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

// Lo que ve el superadmin en la columna "Términos" de cada repartidor (ENVIO-185): la versión aceptada y la
// fecha, o "Pendiente" si no aceptó la vigente.
export function termsLabel(latest: { version: number; acceptedAt: string } | null, currentVersion: number): string {
  if (!latest) return "Pendiente";

  if (latest.version !== currentVersion) return `Pendiente (aceptó la versión ${latest.version})`;

  return `Versión ${latest.version}, aceptada el ${formatAcceptedAt(latest.acceptedAt)}`;
}
