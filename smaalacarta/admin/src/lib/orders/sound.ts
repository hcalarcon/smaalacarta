// Aviso de pedido nuevo: dos tonos cortos generados con Web Audio, sin archivos.
const TONES = [
  { hz: 880, start: 0, length: 0.25 },
  { hz: 660, start: 0.3, length: 0.3 },
];
const VOLUME = 0.25;

type Tone = { hz: number; start: number; length: number };

function playTones(ctx: AudioContext, tones: Tone[], volume = VOLUME, type: OscillatorType = "sine"): void {
  const t0 = ctx.currentTime;

  for (const tone of tones) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = t0 + tone.start;
    const end = start + tone.length;

    osc.type = type;
    osc.frequency.setValueAtTime(tone.hz, start);
    // Sube y baja el volumen para que no suene el "clic" de cortar la onda de golpe.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(end);
  }
}

export function playNewOrderSound(ctx: AudioContext): void {
  playTones(ctx, TONES);
}

// Aviso de "te eligieron": tres tonos que suben, para distinguirlo del pedido nuevo (ENVIO-116).
const CHOSEN_TONES = [
  { hz: 523, start: 0, length: 0.15 },
  { hz: 659, start: 0.17, length: 0.15 },
  { hz: 784, start: 0.34, length: 0.3 },
];

export function playChosenSound(ctx: AudioContext): void {
  playTones(ctx, CHOSEN_TONES);
}

// Aviso de "lo devolvieron" en Pedidos (ADMIN-PEDIDOS-62): tres tonos que bajan, el espejo del anterior.
const RETURNED_TONES = [
  { hz: 784, start: 0, length: 0.15 },
  { hz: 659, start: 0.17, length: 0.15 },
  { hz: 523, start: 0.34, length: 0.3 },
];

export function playReturnedSound(ctx: AudioContext): void {
  playTones(ctx, RETURNED_TONES);
}

// Alarma de pedido sin atender (ADMIN-PEDIDOS-26): una sirena corta, más aguda y áspera que el aviso de
// pedido nuevo, pensada para repetirse en bucle. El volumen lo decide quien la llama según la espera.
const ALARM_TONES: Tone[] = [
  { hz: 1046, start: 0, length: 0.2 },
  { hz: 784, start: 0.24, length: 0.2 },
  { hz: 1046, start: 0.48, length: 0.2 },
  { hz: 784, start: 0.72, length: 0.2 },
];

// Cada cuánto se repite la alarma: dura ~1 s y descansa antes de volver.
export const ALARM_LOOP_MS = 2500;

export function playAlarmSound(ctx: AudioContext, volume: number): void {
  playTones(ctx, ALARM_TONES, volume, "triangle");
}
