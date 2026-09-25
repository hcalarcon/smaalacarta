import { isValidEmail, type ValidationResult } from "@/lib/auth/validation";

// `owner` y `staff` son etiquetas por ahora: ninguna política distingue una de
// otra (ver "`role` no limita nada" en docs/SPEC.md).
export const MEMBER_ROLES = ["owner", "staff"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SLUG_MAX = 40;

// Propone un slug a partir del nombre: sin tildes, en minúsculas, con guiones.
// El resultado siempre cumple el formato que exige la base (o queda vacío).
export function slugify(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
}

// El WhatsApp se guarda solo con dígitos (código de país incluido).
export function normalizeWhatsapp(input: string) {
  return input.replace(/\D/g, "");
}

export function validateNewBusiness(input: {
  name: string;
  slug: string;
  whatsapp: string;
  ownerEmail: string;
  ownerName: string;
}): ValidationResult<"name" | "slug" | "whatsapp" | "ownerEmail"> {
  const errors: Partial<
    Record<"name" | "slug" | "whatsapp" | "ownerEmail", string>
  > = {};

  if (input.name.trim().length < 2) {
    errors.name = "Ingresá el nombre del negocio.";
  }

  if (
    input.slug.length < 2 ||
    input.slug.length > SLUG_MAX ||
    !SLUG_PATTERN.test(input.slug)
  ) {
    errors.slug =
      "Usá entre 2 y 40 caracteres: minúsculas, números y guiones, sin empezar ni terminar con guion.";
  }

  // Vacío es válido. Si hay algo, tiene que parecer un teléfono.
  if (input.whatsapp.trim()) {
    const digits = normalizeWhatsapp(input.whatsapp);
    const hasLetters = /[a-z]/i.test(input.whatsapp);

    if (hasLetters || digits.length < 8 || digits.length > 15) {
      errors.whatsapp =
        "Ingresá el número con código de país, por ejemplo 5493510000000.";
    }
  }

  if (!isValidEmail(input.ownerEmail)) {
    errors.ownerEmail = "Ingresá un email válido para el dueño.";
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
}

export function validateMember(input: {
  email: string;
  role: string;
}): ValidationResult<"email" | "role"> {
  const errors: Partial<Record<"email" | "role", string>> = {};

  if (!isValidEmail(input.email)) {
    errors.email = "Ingresá un email válido.";
  }

  if (!(MEMBER_ROLES as readonly string[]).includes(input.role)) {
    errors.role = "Elegí un rol de la lista.";
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
}
