// Número listo para wa.me / api.whatsapp.com: solo dígitos y con código de país.
// Un número argentino de 10 dígitos (con o sin 0 delante) recibe 549: así funciona
// aunque el negocio lo haya guardado sin código de país.
export function whatsappDigits(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  const local = digits.replace(/^0/, "");
  return local.length === 10 ? `549${local}` : digits;
}
