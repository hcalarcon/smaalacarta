import type { ValidationResult } from "@/lib/auth/validation";
import { normalizeWhatsapp } from "@/lib/superadmin/validation";

import { validateSchedule, type Schedule } from "./schedule";
import { normalizeFacebook, normalizeInstagram } from "./social";

export const TEMPLATES = [
  { key: "moderno", label: "Moderno" },
  { key: "clasico", label: "Clásico" },
  { key: "minimal", label: "Minimalista" },
] as const;

export type TemplateKey = (typeof TEMPLATES)[number]["key"];

export type SettingsInput = {
  published: boolean;
  template: string;
  tagline: string;
  primaryColor: string;
  secondaryColor: string;
  headerImageUrl: string;
  logoUrl: string;
  schedule: Schedule;
  whatsapp: string;
  address: string;
  // `@usuario`, el usuario o la dirección de la red; se guarda como dirección https.
  instagram: string;
  facebook: string;
  temporarilyClosed: boolean;
  closedMessage: string;
  // Día en que reabre, "YYYY-MM-DD", o vacío.
  reopensOn: string;
};

// Los colores de la marca, como en la landing. Un negocio nuevo arranca así.
export const DEFAULT_SETTINGS: SettingsInput = {
  published: false,
  template: "moderno",
  tagline: "",
  primaryColor: "#5a4a3a",
  secondaryColor: "#d97706",
  headerImageUrl: "",
  logoUrl: "",
  schedule: {},
  whatsapp: "",
  address: "",
  instagram: "",
  facebook: "",
  temporarilyClosed: false,
  closedMessage: "",
  reopensOn: "",
};

type Field =
  | "template"
  | "tagline"
  | "primaryColor"
  | "secondaryColor"
  | "headerImageUrl"
  | "logoUrl"
  | "schedule"
  | "whatsapp"
  | "address"
  | "instagram"
  | "facebook"
  | "closedMessage"
  | "reopensOn";

const COLOR = /^#[0-9a-fA-F]{6}$/;
// Solo https y sin caracteres que rompan un atributo o un estilo (mismo criterio
// que la restricción de la base).
const IMAGE_URL = /^https:\/\/[^\s"'()<>]+$/;
export const TAGLINE_MAX = 200;
export const ADDRESS_MAX = 200;
export const CLOSED_MESSAGE_MAX = 200;

// "YYYY-MM-DD" que existe en el calendario (rechaza 2027-02-29 o 2030-13-01).
function isRealDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

// Deja las redes como direcciones https (si son válidas) y recorta los textos. Lo que
// no se pueda normalizar queda como está, para que la validación lo marque.
export function normalizeSettingsText(input: SettingsInput): SettingsInput {
  return {
    ...input,
    address: input.address.trim(),
    closedMessage: input.closedMessage.trim(),
    reopensOn: input.reopensOn.trim(),
    instagram: normalizeInstagram(input.instagram) ?? input.instagram.trim(),
    facebook: normalizeFacebook(input.facebook) ?? input.facebook.trim(),
  };
}

export function validateSettings(input: SettingsInput): ValidationResult<Field> {
  const errors: Partial<Record<Field, string>> = {};

  if (!TEMPLATES.some((t) => t.key === input.template)) {
    errors.template = "Elegí una de las plantillas.";
  }

  if (!COLOR.test(input.primaryColor)) {
    errors.primaryColor = "Elegí un color válido, por ejemplo #5a4a3a.";
  }

  if (!COLOR.test(input.secondaryColor)) {
    errors.secondaryColor = "Elegí un color válido, por ejemplo #d97706.";
  }

  if (input.headerImageUrl.trim() && !IMAGE_URL.test(input.headerImageUrl.trim())) {
    errors.headerImageUrl = "Ingresá una dirección que empiece con https://";
  }

  if (input.logoUrl.trim() && !IMAGE_URL.test(input.logoUrl.trim())) {
    errors.logoUrl = "Ingresá una dirección que empiece con https://";
  }

  if (input.tagline.length > TAGLINE_MAX) {
    errors.tagline = `Usá hasta ${TAGLINE_MAX} caracteres.`;
  }

  if (input.address.length > ADDRESS_MAX) {
    errors.address = `Usá hasta ${ADDRESS_MAX} caracteres.`;
  }

  if (normalizeInstagram(input.instagram) === null) {
    errors.instagram = "Ingresá tu usuario (@usuario) o la dirección de tu Instagram.";
  }

  if (normalizeFacebook(input.facebook) === null) {
    errors.facebook = "Ingresá el nombre de tu página o la dirección de tu Facebook.";
  }

  if (input.closedMessage.length > CLOSED_MESSAGE_MAX) {
    errors.closedMessage = `Usá hasta ${CLOSED_MESSAGE_MAX} caracteres.`;
  }

  if (input.reopensOn.trim() && !isRealDate(input.reopensOn.trim())) {
    errors.reopensOn = "Ingresá una fecha válida.";
  }

  const schedule = validateSchedule(input.schedule);
  if (!schedule.ok) {
    errors.schedule = Object.entries(schedule.errors)
      .map(([day, message]) => `${day}: ${message}`)
      .join(" ");
  }

  if (input.whatsapp.trim()) {
    const digits = normalizeWhatsapp(input.whatsapp);
    if (/[a-z]/i.test(input.whatsapp) || digits.length < 8 || digits.length > 15) {
      errors.whatsapp = "Ingresá el número con código de país, por ejemplo 5493510000000.";
    }
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
}
