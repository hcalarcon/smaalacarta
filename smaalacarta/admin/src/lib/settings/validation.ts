import type { ValidationResult } from "@/lib/auth/validation";
import { normalizeWhatsapp } from "@/lib/superadmin/validation";

import {
  ALL_DELIVERY,
  ALL_PAYMENT,
  normalizeDeliveryPayment,
  validateDeliveryPayment,
} from "./payment";
import { CENTER, isFocus } from "./header-focus";
import { normalizePreorders, validatePreorders, type PreorderCutoffs } from "./preorders";
import { validateSchedule, type Schedule } from "./schedule";
import {
  DEFAULT_LEAD,
  normalizeScheduledOrders,
  validateScheduledOrders,
} from "./scheduled";
import { normalizeFacebook, normalizeInstagram } from "./social";

export const TEMPLATES = [
  { key: "moderno", label: "Moderno" },
  { key: "clasico", label: "Clásico" },
  { key: "minimal", label: "Minimalista" },
] as const;

export type TemplateKey = (typeof TEMPLATES)[number]["key"];

// Variante de color de la plantilla: se elige a mano acá, no sigue el modo del
// sistema del visitante (ADMIN-CONFIG-9).
export const THEMES = [
  { key: "claro", label: "Claro" },
  { key: "oscuro", label: "Oscuro" },
] as const;

export type ThemeKey = (typeof THEMES)[number]["key"];

export type SettingsInput = {
  published: boolean;
  template: string;
  theme: string;
  tagline: string;
  primaryColor: string;
  secondaryColor: string;
  headerImageUrl: string;
  // Punto de enfoque de la imagen de cabecera, enteros de 0 a 100 (ADMIN-CONFIG-25 y 26).
  headerImageX: number;
  headerImageY: number;
  logoUrl: string;
  // El PDF del menú (Etapa 6e): independiente de `published`, no se muestra en
  // el menú digital, solo se linkea aparte (QR).
  menuPdfUrl: string;
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
  // Qué entrega y qué medios de pago ofrece, y los datos de su transferencia
  // (ADMIN-CONFIG-11 y 12). Alias y CBU/CVU solo cuentan con "transferencia" tildada.
  deliveryOptions: string[];
  paymentOptions: string[];
  transferAlias: string;
  transferCbu: string;
  // Pedidos programados (ADMIN-CONFIG-16): si acepta pedidos para una hora de hoy y con cuántos
  // minutos de anticipación como mínimo (15 a 240).
  allowScheduledOrders: boolean;
  scheduledLeadMinutes: number;
  // Pedidos anticipados (ADMIN-CONFIG-18): con el negocio cerrado, pedidos para la próxima
  // apertura hasta un corte por día de venta.
  preordersEnabled: boolean;
  preorderCutoffs: PreorderCutoffs;
};

// Los colores de la marca, como en la landing. Un negocio nuevo arranca así.
export const DEFAULT_SETTINGS: SettingsInput = {
  published: false,
  template: "moderno",
  theme: "claro",
  tagline: "",
  primaryColor: "#5a4a3a",
  secondaryColor: "#d97706",
  headerImageUrl: "",
  headerImageX: CENTER,
  headerImageY: CENTER,
  logoUrl: "",
  menuPdfUrl: "",
  schedule: {},
  whatsapp: "",
  address: "",
  instagram: "",
  facebook: "",
  temporarilyClosed: false,
  closedMessage: "",
  reopensOn: "",
  deliveryOptions: [...ALL_DELIVERY],
  // Mercado Pago no va de entrada: depende de las credenciales del negocio (MP-1).
  paymentOptions: ALL_PAYMENT.filter((option) => option !== "mercadopago"),
  transferAlias: "",
  transferCbu: "",
  allowScheduledOrders: true,
  scheduledLeadMinutes: DEFAULT_LEAD,
  preordersEnabled: false,
  preorderCutoffs: {},
};

type Field =
  | "template"
  | "theme"
  | "tagline"
  | "primaryColor"
  | "secondaryColor"
  | "headerImageUrl"
  | "headerImageX"
  | "headerImageY"
  | "logoUrl"
  | "menuPdfUrl"
  | "schedule"
  | "whatsapp"
  | "address"
  | "instagram"
  | "facebook"
  | "closedMessage"
  | "reopensOn"
  | "deliveryOptions"
  | "paymentOptions"
  | "transferAlias"
  | "transferCbu"
  | "scheduledLeadMinutes"
  | "preorderCutoffs";

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
  return normalizePreorders(normalizeScheduledOrders(normalizeDeliveryPayment({
    ...input,
    address: input.address.trim(),
    closedMessage: input.closedMessage.trim(),
    reopensOn: input.reopensOn.trim(),
    instagram: normalizeInstagram(input.instagram) ?? input.instagram.trim(),
    facebook: normalizeFacebook(input.facebook) ?? input.facebook.trim(),
  })));
}

export function validateSettings(input: SettingsInput): ValidationResult<Field> {
  const errors: Partial<Record<Field, string>> = {};

  if (!TEMPLATES.some((t) => t.key === input.template)) {
    errors.template = "Elegí una de las plantillas.";
  }

  if (!THEMES.some((t) => t.key === input.theme)) {
    errors.theme = "Elegí un tema.";
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

  if (!isFocus(input.headerImageX)) {
    errors.headerImageX = "El punto de enfoque tiene que ser un número entero de 0 a 100.";
  }

  if (!isFocus(input.headerImageY)) {
    errors.headerImageY = "El punto de enfoque tiene que ser un número entero de 0 a 100.";
  }

  if (input.logoUrl.trim() && !IMAGE_URL.test(input.logoUrl.trim())) {
    errors.logoUrl = "Ingresá una dirección que empiece con https://";
  }

  if (input.menuPdfUrl.trim() && !IMAGE_URL.test(input.menuPdfUrl.trim())) {
    errors.menuPdfUrl = "Ingresá una dirección que empiece con https://";
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

  const deliveryPayment = validateDeliveryPayment(input);
  if (!deliveryPayment.ok) {
    Object.assign(errors, deliveryPayment.errors);
  }

  const scheduledOrders = validateScheduledOrders(input);
  if (!scheduledOrders.ok) {
    Object.assign(errors, scheduledOrders.errors);
  }

  const preorders = validatePreorders(input);
  if (!preorders.ok) {
    Object.assign(errors, preorders.errors);
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
      errors.whatsapp = "Ingresá el número con código de área, por ejemplo 3510000000.";
    }
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
}
