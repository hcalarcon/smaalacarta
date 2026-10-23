// Sonido de un tema (WEB-VITRINA-10): nace apagado, no crea el contexto de audio hasta que la persona lo
// prende y, apagado, `sonar` no hace nada. `crearAudio` se inyecta para poder probarlo sin navegador.

export function crearSonido({ crearAudio }) {
  let audio = null;
  let prendido = false;

  function nota(frecuencia, inicio, duracion, tipo) {
    const osc = audio.createOscillator();
    const volumen = audio.createGain();
    osc.type = tipo;
    osc.frequency.value = frecuencia;
    volumen.gain.setValueAtTime(0.06, audio.currentTime + inicio);
    volumen.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + inicio + duracion);
    osc.connect(volumen).connect(audio.destination);
    osc.start(audio.currentTime + inicio);
    osc.stop(audio.currentTime + inicio + duracion);
  }

  return {
    get prendido() {
      return prendido;
    },
    // Prende o apaga; devuelve cómo quedó. Si el navegador no tiene audio, queda apagado.
    alternar() {
      prendido = !prendido;
      if (prendido && !audio) {
        try {
          audio = crearAudio();
        } catch {
          audio = null;
        }
        if (!audio) prendido = false;
      }
      if (prendido) audio.resume?.();
      return prendido;
    },
    // notas: [[frecuencia, inicio, duración]]
    sonar(notas, tipo = "square") {
      if (!prendido || !audio) return;
      notas.forEach(([frecuencia, inicio, duracion]) => nota(frecuencia, inicio, duracion, tipo));
    },
  };
}
