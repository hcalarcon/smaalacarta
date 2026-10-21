"use client";

import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import { useEffect, useRef } from "react";

import { findTourTarget, useTutorial } from "./tutorial-context";
import { TUTORIAL_SKIP_LABEL } from "@/lib/courier/tutorial";

// Cuánto se espera a que aparezca la tarjeta del pedido de práctica antes de mostrar la burbuja en el centro.
const WAIT_MS = 1500;

// La capa del tour (ENVIO-214): oscurece la pantalla y una burbuja señala cada botón real, en orden. Solo
// presenta: qué paso toca y qué pedido de práctica se ve lo decide el estado del tutorial.
export default function CourierTour() {
  const tutorial = useTutorial();
  const drv = useRef<Driver | null>(null);

  const step = tutorial?.step ?? null;
  const index = tutorial?.index ?? 0;
  const total = tutorial?.steps.length ?? 0;
  // Siempre los últimos, sin que cambiarlos vuelva a dibujar la burbuja.
  const next = useRef(tutorial?.next);
  const skip = useRef(tutorial?.skip);

  useEffect(() => {
    next.current = tutorial?.next;
    skip.current = tutorial?.skip;
  });

  // Una sola instancia mientras dura el tour. `allowClose` apagado: el fondo y Esc no lo cierran; se sale con Saltear.
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    drv.current = driver({
      animate: !reduced,
      smoothScroll: !reduced,
      allowClose: false,
      allowKeyboardControl: false,
      overlayOpacity: 0.7,
      stagePadding: 6,
      stageRadius: 12,
      popoverClass: "sma-tour",
      popoverOffset: 12,
    });

    return () => {
      drv.current?.destroy();
      drv.current = null;
    };
  }, []);

  useEffect(() => {
    if (!step || !drv.current) return;

    const instance = drv.current;
    let cancelled = false;
    let frame = 0;
    const started = performance.now();

    const show = (element: HTMLElement | null) => {
      if (cancelled) return;

      instance.highlight({
        element: element ?? undefined,
        // En los pasos que esperan un toque el botón señalado es el real; en los demás no se puede tocar, para
        // no salir de la pantalla ni cambiar la disponibilidad de verdad.
        disableActiveInteraction: !step.waitsForTap,
        popover: {
          description: step.text,
          side: element ? step.side : "over",
          align: "center",
          showProgress: true,
          progressText: `${index + 1} de ${total}`,
          showButtons: step.waitsForTap ? [] : ["next"],
          nextBtnText: step.action ?? (index + 1 >= total ? "Empezar" : "Siguiente"),
          onNextClick: () => next.current?.(),
          onPopoverRender: (popover) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "sma-tour-skip";
            button.textContent = TUTORIAL_SKIP_LABEL;
            button.addEventListener("click", () => skip.current?.());
            popover.footerButtons.prepend(button);
          },
        },
      });
    };

    // La tarjeta del pedido de práctica se dibuja recién después de pasar de paso: se la espera un momento.
    const find = () => {
      if (cancelled) return;

      const element = step.target ? findTourTarget(step.target) : null;

      if (element || !step.target || performance.now() - started > WAIT_MS) show(element);
      else frame = requestAnimationFrame(find);
    };

    find();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [step, index, total]);

  return null;
}
