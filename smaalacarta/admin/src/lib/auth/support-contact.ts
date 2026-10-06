// A quién pedirle que restablezca una contraseña olvidada (ADMIN-AUTH-16): el mismo WhatsApp
// que usa la landing. El mensaje va armado para que el equipo sepa qué se pide.
const SUPPORT_PHONE = "5493644277105";
const SUPPORT_MESSAGE =
  "Hola, olvidé mi contraseña de SMA a la Carta. ¿Me la pueden restablecer? Mi email es: ";

export const SUPPORT_WHATSAPP_URL = `https://api.whatsapp.com/send?phone=${SUPPORT_PHONE}&text=${encodeURIComponent(SUPPORT_MESSAGE)}`;
