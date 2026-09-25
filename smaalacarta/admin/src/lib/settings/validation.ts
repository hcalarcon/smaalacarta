import type { ValidationResult } from "@/lib/auth/validation";
import { normalizeWhatsapp } from "@/lib/superadmin/validation";

import { validateSchedule, type Schedule } from "./schedule";

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
  schedule: Schedule;
  whatsapp: string;
};

// Los colores de la marca, como en la landing. Un negocio nuevo arranca así.
export const DEFAULT_SETTINGS: SettingsInput = {
  published: false,
  template: "moderno",
  tagline: "",
  primaryColor: "#5a4a3a",
  secondaryColor: "#d97706",
  headerImageUrl: "",
  schedule: {},
  whatsapp: "",
};

type Field =
  | "template"
  | "tagline"
  | "primaryColor"
  | "secondaryColor"
  | "headerImageUrl"
  | "schedule"
  | "whatsapp";

const COLOR = /^#[0-9a-fA-F]{6}$/;
// Solo https y sin caracteres que rompan un atributo o un estilo (mismo criterio
// que la restricción de la base).
const IMAGE_URL = /^https:\/\/[^\s"'()<>]+$/;
export const TAGLINE_MAX = 200;

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

  if (input.tagline.length > TAGLINE_MAX) {
    errors.tagline = `Usá hasta ${TAGLINE_MAX} caracteres.`;
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
