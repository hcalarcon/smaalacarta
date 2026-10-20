// Registro de los pasos del recorrido con sus tiempos en cada video.
// Cada video arranca cuando se crea su página: `origenes` son esos instantes (ms), y los tiempos de
// cada paso se miden desde ahí, así que los tres videos comparten la misma línea de tiempo real.
const segundos = (ms) => Math.round(ms) / 1000;

export function crearRegistro(origenes, ahora = () => Date.now()) {
  const pasos = [];

  return {
    pasos,
    async paso(id, texto, fn) {
      const inicio = ahora();
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
        pasos.push({
          n: pasos.length + 1,
          id,
          texto,
          ...(fallo ? { fallo: true } : {}),
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
