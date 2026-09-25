// Tipos de link de mail que /auth/confirm acepta. Cualquiera puede armar una
// URL con otro `type`, así que se permite solo lo que la app envía: la
// invitación de un superadmin y la recuperación de contraseña.
const CONFIRM_TYPES = ["invite", "recovery"] as const;

export type ConfirmType = (typeof CONFIRM_TYPES)[number];

export function parseConfirmType(
  value: string | null | undefined,
): ConfirmType | null {
  return (CONFIRM_TYPES as readonly string[]).includes(value ?? "")
    ? (value as ConfirmType)
    : null;
}
