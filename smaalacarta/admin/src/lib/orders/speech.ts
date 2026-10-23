// Voz de "Nuevo pedido" con la síntesis del navegador (ADMIN-PEDIDOS-27). Si no existe, no pasa nada: el
// sonido y la notificación siguen. Solo se llama después de que la persona activó el sonido.

export function speakText(text: string, volume = 1): boolean {
  try {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
    if (typeof SpeechSynthesisUtterance === "undefined") return false;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "es-AR";
    utterance.volume = volume;
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

export function speakNewOrder(): boolean {
  return speakText("Nuevo pedido");
}

// Habilita la voz con un toque (iPhone y Chrome la bloquean hasta que la persona toca): una frase vacía.
export function primeSpeech(): void {
  speakText("", 0);
}

export function cancelSpeech(): void {
  try {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  } catch {
    // Nada que cancelar.
  }
}
