// WhatsApp en una ventana aparte, solo en PC (SEGUIMIENTO-14). El navegador bloquea
// window.open si se llama después de un await, así que la ventana en blanco se abre al
// tocar "enviar" (dentro del gesto) y recién con el pedido guardado se la manda a WhatsApp.

const MOBILE_UA = /Android|iPhone|iPad|Mobile/;

// Escritorio: puntero fino con hover y un navegador que no es de celular ni de tablet.
export function shouldUseNewWindow(env) {
  const fine = env?.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches === true;
  return fine && !MOBILE_UA.test(env?.navigator?.userAgent ?? "");
}

// Devuelve la ventana en blanco, o null si no corresponde o el navegador la bloqueó.
export function openPlaceholder(win) {
  if (!shouldUseNewWindow(win)) return null;
  try {
    return win.open("about:blank", "_blank") ?? null;
  } catch {
    return null;
  }
}

// "window" si WhatsApp se abrió en la ventana en blanco; "same-tab" si hubo que usar la pestaña.
export function openWhatsApp(placeholder, url, nav) {
  if (placeholder && !placeholder.closed) {
    try {
      placeholder.opener = null;
      placeholder.location.href = url;
      return "window";
    } catch {
      // Si no se pudo usar, se sigue en la misma pestaña.
    }
  }
  nav.location.href = url;
  return "same-tab";
}

export function discardPlaceholder(placeholder) {
  if (!placeholder || placeholder.closed) return;
  try {
    placeholder.close();
  } catch {
    // Nada que hacer: la ventana en blanco queda abierta.
  }
}
