// Los textos del menú los escribe cada negocio desde el admin: nunca se deben
// interpolar en HTML sin escapar (PUBLICO-9). Un nombre como `<img onerror=…>` sería
// código ejecutándose en el navegador de cada cliente.

const ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

// Solo direcciones http(s) absolutas: descarta `javascript:`, `data:`, rutas
// relativas y cualquier otra cosa. Devuelve "" si no es válida.
export function safeHttpUrl(value) {
  if (typeof value !== "string") return "";

  const url = value.trim();
  return /^https?:\/\/[^\s]+$/i.test(url) ? url : "";
}

// `url("…")` para un estilo CSS, sin que la dirección pueda cerrar el paréntesis ni
// la comilla. Con una dirección no válida devuelve "none".
export function cssUrl(value) {
  const url = safeHttpUrl(value);
  if (!url) return "none";

  const encoded = url.replace(/["()\\\s]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
  return `url("${encoded}")`;
}
