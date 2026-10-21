# Edición del video demo

Toma las grabaciones reales de `npm run video-demo` (`cliente.mp4`, `local.mp4`,
`repartidor.mp4` y `pasos.json`) y saca **tres videos** con HyperFrames, sin audio:

- `explicativo-16x9.mp4` (1920x1080, 60 a 75 s): las tres pantallas; la de quien actúa, grande y al
  centro; las otras, chicas a los costados. Cuando una acción en una pantalla se refleja en otra,
  dos pantallas lado a lado con una flecha animada.
- `explicativo-9x16.mp4` (1080x1920, 50 a 60 s): una pantalla por vez, dentro de un marco de celular
  (cliente y repartidor) o de notebook (local).
- `redes-9x16.mp4` (1080x1920, 30 a 35 s): para Reels, TikTok y estados. Una idea por vez, de 1,5 a
  2,5 s, en orden fijo (gancho, el cliente elige, confirma, te suena, aceptás, el repartidor, listo,
  seguimiento, entregado, cierre). Adentro de cada idea hay cortes rápidos y zooms de golpe sobre una
  grilla de 0,5 s (`final/redes-cortes.txt` lista los cortes para calzar un audio).

Los dos explicativos de formato vertical comparten: la **pastilla de quién habla** (📱 Cliente naranja,
🏪 Tu local verde, 🛵 Repartidor azul) fija arriba, el **pase** de 0,5 s cuando la acción pasa de un
actor a otro (el pedido sale de un dispositivo y entra al otro), los **títulos** enteros que aparecen por
palabra en menos de 0,3 s en una zona propia que no tapa la app, y el **festejo** (check y confeti
sutil) por encima del seguimiento real en «Entregado». El zoom deja el foco con 12 % de margen y se
aleja si no entra. Lo común está en `scripts/video-demo/dispositivos.mjs`.

El explicativo horizontal lleva arriba la barra de estados (Recibido → … → Entregado), que avanza
cuando cambia el estado real, y un subtítulo por paso; el vertical, la misma barra bajo la pastilla.

## Cómo se vuelve a renderizar

```bash
npm run video-demo:editar                                  # última carpeta completa de video-demo/salida
npm run video-demo:editar -- --carpeta <ruta>              # una en particular
npm run video-demo:editar -- --solo explicativo-h          # o explicativo-v, o redes
npm run video-demo:editar -- --preparar                    # arma los proyectos sin renderizar
```

Los MP4 quedan en `<carpeta>/final/` (menos de 16 MB cada uno; si pasa, baja el bitrate solo) y,
en `final/tiras/`, una imagen con un cuadro cada 4 s (cada 2 s en redes) para revisarlos sin abrir el
video. **No corras dos veces a la vez**: cada corrida rehace `final/_proyecto/`. Un render tarda
varios minutos por video. HyperFrames corre con la telemetría apagada y con la caché de cuadros
apagada (`--frames-cache-dir off`): sin eso dejaba en la carpeta temporal un
`hyperframes-extract-cache-*` de varios GB.

## Qué hay acá

- `plan.json`: el guion (en redes, `ideas` con sus `cortes`). Cada toma se ancla a un paso de `pasos.json` y dice cuánta grabación cubre,
  a qué velocidad, con qué subtítulo y qué estado enciende. Es lo único que se toca para ajustar.
- `plantilla-explicativo-h.html`, `plantilla-explicativo-v.html`, `plantilla-redes.html`, `marca.css`
  y `motor.js`: la composición. El script les inyecta los recortes y el guion de animación.
- `scripts/video-demo/`: `camara.mjs` (cámara guiada por los focos), `edicion.mjs` (explicativo
  horizontal), `explicativo-v.mjs`, `redes.mjs` y `dispositivos.mjs` (marco, pastilla, pase, festejo).
  Todo con tests.
- `fonts/`, `logo.png`, `vendor/gsap.min.js`: copiados acá para que el render no dependa de la red.

## Reglas

- La interfaz es la real: solo se recorta, se enmarca, se mueve y se acelera. No se redibuja.
- La cámara va al foco de toque un poco antes del toque, después al de resultado, y al terminar se
  aleja a mostrar el contexto. Sale de los focos de `pasos.json`; nunca se adivina. Los toques muy
  seguidos se juntan en una sola parada, para que no rebote.
- Nada de «×N»: lo acelerado lleva un ícono de adelantar. La preparación y el viaje del repartidor
  llevan «unos minutos después».
- Si una grabación nueva trae pasos que el plan no usa ni lista en `omitidos`, el script frena y los nombra.
- `en` (en una toma) y `desde` por panel (en redes) permiten alinear dos grabaciones: en la
  grabación real el aviso al local aparece unos segundos después de confirmar, y la edición los
  junta para que se vea el efecto. `salto` saca un pedazo del medio (p. ej. una página que carga en blanco).
- `focos` en una toma fija el encuadre (px de la grabación) y la cámara se queda ahí: el aviso y el modal
  de aceptar, o la tarjeta del pedido en el tablero.
- `celebra` (en una toma o idea) es el segundo en que el seguimiento pasa a «Entregado» en la grabación
  real; el festejo arranca ahí.
- El foco «resultado» del local en `local-recibe` es la tarjeta del tablero, no el aviso: para el aviso,
  `plan.json` trae su propio rectángulo (`rect` / `focos`).
