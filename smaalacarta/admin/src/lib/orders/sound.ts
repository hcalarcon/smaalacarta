// Aviso de pedido nuevo: dos tonos cortos generados con Web Audio, sin archivos.
const TONES = [
  { hz: 880, start: 0, length: 0.25 },
  { hz: 660, start: 0.3, length: 0.3 },
];
const VOLUME = 0.25;

export function playNewOrderSound(ctx: AudioContext): void {
  const t0 = ctx.currentTime;

  for (const tone of TONES) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = t0 + tone.start;
    const end = start + tone.length;

    osc.type = "sine";
    osc.frequency.setValueAtTime(tone.hz, start);
    // Sube y baja el volumen para que no suene el "clic" de cortar la onda de golpe.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(VOLUME, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(end);
  }
}
