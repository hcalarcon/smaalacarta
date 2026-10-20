# Edición del video demo

Toma las grabaciones reales de `npm run video-demo` (`cliente.mp4`, `local.mp4`,
`repartidor.mp4` y `pasos.json`) y saca dos videos con HyperFrames, sin audio:

- `demo-16x9.mp4` (1920x1080): las tres pantallas juntas, se resalta la de quien actúa.
- `demo-9x16.mp4` (1080x1920): una pantalla por vez; el panel del local va recortado sobre la tarjeta.

## Cómo se vuelve a renderizar

```bash
npm run video-demo:editar                      # última carpeta completa de video-demo/salida
npm run video-demo:editar -- --carpeta <ruta>  # una en particular
```

Los MP4 quedan en `<carpeta>/final/` (menos de 16 MB cada uno; si pasa, baja el
bitrate solo). Un render tarda unos 10 minutos. HyperFrames corre con la telemetría apagada.

## Qué hay acá

- `plan.json`: qué se muestra de cada paso (por `id` de `pasos.json`), a qué velocidad,
  con qué subtítulo y qué recorte en el vertical. **Es lo único que se toca para ajustar la edición.**
- `plantilla-16x9.html`, `plantilla-9x16.html`, `marca.css`: la composición. El script
  les inyecta los videos ya recortados, los subtítulos y los tiempos.
- `fonts/` (Bricolage Grotesque e Instrument Sans, licencia OFL), `logo.png`, `vendor/gsap.min.js`:
  copiados acá para que el render no dependa de la red.

## Reglas

- La interfaz es la real: solo se recorta, se acelera y se le suman textos.
- Todo tramo acelerado lleva su marca (`×4`). La preparación y el viaje del repartidor llevan
  además «unos minutos después», porque en la vida real tardan.
- Si una grabación nueva trae pasos distintos, el script frena y dice cuáles faltan en el plan.
- Los recortes del vertical (`crop`) están medidos sobre el panel del local de 1280x800. El
  deslizamiento de «local-listo» (la tarjeta pasa de En curso a Listos) cae a los 4,6 s del paso:
  si el tablero cambia de ritmo, ajustá `en`.
