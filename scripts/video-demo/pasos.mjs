// Registro de los pasos del recorrido con sus tiempos en cada video.
// Cada video arranca cuando se crea su página: `origenes` son esos instantes (ms), y los tiempos de
// cada paso se miden desde ahí, así que los tres videos comparten la misma línea de tiempo real.
const segundos = (ms) => Math.round(ms) / 1000;

// `escala` (un número, o uno por pantalla) convierte píxeles de la página a píxeles del video (deviceScaleFactor); `limites` son el ancho y
// el alto del video de cada pantalla, para que un foco nunca se salga del cuadro.
export function crearRegistro(origenes, ahora = () => Date.now(), { escala: escalaPorPantalla = 1, limites = {} } = {}) {
  const pasos = [];
  const latencias = [];
  let focos = null;
  // Desde qué segundo de cada video ya están las tres pantallas cargadas; los videos arrancan antes (en blanco).
  const inicioUtil = {};

  return {
    pasos,
    latencias,
    inicioUtil,
    marcarInicio() {
      const ya = ahora();
      for (const [video, origen] of Object.entries(origenes)) inicioUtil[video] = segundos(ya - origen);
    },
    // Un foco es un rectángulo del video (x, y, w, h) con el segundo en que importa: `toque` es el botón o el
    // campo que se toca; `resultado`, lo que muestra el efecto. `box` viene de boundingBox() (relativo a la
    // ventana, así que ya contempla el scroll). Fuera de un paso no se guarda nada.
    foco(pantalla, tipo, box, cuando = ahora()) {
      if (!focos || !box || !(pantalla in origenes)) return;
      const tope = limites[pantalla];
      const escala = typeof escalaPorPantalla === "number" ? escalaPorPantalla : (escalaPorPantalla[pantalla] ?? 1);
      const x = Math.max(0, Math.round(box.x * escala));
      const y = Math.max(0, Math.round(box.y * escala));
      const derecha = Math.round((box.x + box.width) * escala);
      const abajo = Math.round((box.y + box.height) * escala);
      const w = Math.min(derecha, tope?.w ?? Infinity) - x;
      const h = Math.min(abajo, tope?.h ?? Infinity) - y;
      if (w <= 0 || h <= 0) return;
      focos.push({ pantalla, tipo, t: segundos(cuando - origenes[pantalla]), x, y, w, h });
    },
    async paso(id, texto, fn) {
      const inicio = ahora();
      const propios = (focos = []);
      let fallo = false;
      try {
        return await fn();
      } catch (error) {
        fallo = true;
        // Playwright cuenta qué estaba esperando en el «Call log».
        const lines = String(error?.message ?? error)
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
        const causa = [lines[0], lines.find((line) => /waiting for/.test(line))].filter(Boolean).join(" ");
        throw new Error(`Falló el paso «${texto}»: ${causa}`, { cause: error });
      } finally {
        const fin = ahora();
        focos = null;
        pasos.push({
          n: pasos.length + 1,
          id,
          texto,
          ...(fallo ? { fallo: true } : {}),
          focos: propios,
          videos: Object.fromEntries(
            Object.entries(origenes).map(([video, origen]) => [
              video,
              { inicio: segundos(inicio - origen), fin: segundos(fin - origen) },
            ]),
          ),
        });
      }
    },
  };
}
