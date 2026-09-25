const GENERIC = "No pudimos completar la acción. Probá de nuevo.";

// Por código de error de Supabase Auth. Nunca se muestra el texto original:
// viene en inglés y a veces revela de más (por ejemplo, si un email existe).
const BY_CODE: Record<string, string> = {
  invalid_credentials: "El email o la contraseña no son correctos.",
  email_not_confirmed:
    "Todavía no confirmaste tu email. Revisá tu casilla y abrí el link que te enviamos.",
  over_email_send_rate_limit:
    "Se enviaron muchos mails seguidos. Esperá unos minutos y probá de nuevo.",
  over_request_rate_limit:
    "Hiciste demasiados intentos. Esperá unos minutos y probá de nuevo.",
  user_already_exists: "Ya existe una cuenta con ese email. Probá iniciar sesión.",
  email_exists: "Ya existe una cuenta con ese email. Probá iniciar sesión.",
  weak_password:
    "Esa contraseña es muy débil. Usá una más larga y difícil de adivinar.",
  same_password: "La contraseña nueva tiene que ser distinta de la actual.",
  otp_expired: "El link venció. Pedí uno nuevo.",
  session_not_found: "Tu sesión venció. Volvé a iniciar sesión.",
  // No es un código de Supabase: lo produce nuestro cliente de servicio.
  service_key_missing:
    "Falta configurar la clave de servicio del servidor. Avisale a quien administra el sistema.",
};

export function authErrorMessage(error: { code?: string; message?: string }) {
  return (error.code && BY_CODE[error.code]) || GENERIC;
}
