// Voz de "Nuevo pedido" con la síntesis del navegador (ADMIN-PEDIDOS-27). Si no existe, no pasa nada: el
// sonido y la notificación siguen. Solo se llama después de que la persona activó el sonido.

export function speakNewOrder(): boolean {
  try {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
    if (typeof SpeechSynthesisUtterance === "undefined") return false;

    const utterance = new SpeechSynthesisUtterance("Nuevo pedido");
    utterance.lang = "es-AR";
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

export function cancelSpeech(): void {
  try {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  } catch {
    // Nada que cancelar.
  }
}
