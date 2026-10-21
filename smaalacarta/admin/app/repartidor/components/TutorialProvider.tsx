"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { markTutorialSeenAction } from "../actions";
import CourierTour from "./CourierTour";
import { TutorialContext, findTourTarget, type Tutorial } from "./tutorial-context";
import { courierTab } from "@/lib/courier/nav";
import {
  practicePhase,
  tutorialSteps,
  visibleSteps,
  type TutorialMode,
  type TutorialStep,
  type TutorialStepId,
} from "@/lib/courier/tutorial";

// El estado del tutorial (ENVIO-213 a 218). Arranca solo la primera vez, o cuando el repartidor lo pide desde su
// perfil, y siempre sobre Pedidos: ahí están todos los botones que señala. Se marca visto al terminar o al saltear.
export default function TutorialProvider({
  mode,
  zonePrice,
  autoStart,
  initialStep,
  children,
}: {
  mode: TutorialMode;
  zonePrice: number | null;
  // Todavía no lo vio y ya aceptó los términos (o no se exigen).
  autoStart: boolean;
  // Solo para probar: arranca ya en ese paso, con todos los pasos.
  initialStep?: TutorialStepId;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [steps, setSteps] = useState<TutorialStep[]>(() =>
    initialStep ? visibleSteps(tutorialSteps(mode), () => true) : [],
  );
  const [index, setIndex] = useState(() =>
    initialStep ? Math.max(0, tutorialSteps(mode).findIndex((step) => step.id === initialStep)) : -1,
  );
  const [requested, setRequested] = useState(false);
  const [autoStarted, setAutoStarted] = useState(Boolean(initialStep));

  const active = index >= 0;
  const step = active ? (steps[index] ?? null) : null;

  const finish = useCallback(() => {
    setIndex(-1);
    setSteps([]);
    // Si no se pudo guardar, vuelve a ofrecerse la próxima vez: no es un error para quien lo está viendo.
    markTutorialSeenAction().catch(() => {});
  }, []);

  const begin = useCallback(() => {
    const list = visibleSteps(tutorialSteps(mode), (target) => findTourTarget(target) !== null);

    setSteps(list);
    setIndex(0);
    setRequested(false);
    setAutoStarted(true);
  }, [mode]);

  const next = useCallback(() => {
    if (index + 1 >= steps.length) finish();
    else setIndex(index + 1);
  }, [finish, index, steps.length]);

  const tap = useCallback(
    (expected: TutorialStepId) => {
      if (step?.id === expected) next();
    },
    [next, step],
  );

  const request = useCallback(() => {
    setRequested(true);
    router.push("/repartidor");
  }, [router]);

  // Salir de Pedidos durante el tutorial lo cierra: los pasos que siguen necesitan esa pantalla. No cuenta como
  // visto (no lo terminó ni lo salteó): la próxima vez que entre se vuelve a ofrecer.
  if (active && pathname !== "/repartidor") {
    setIndex(-1);
    setSteps([]);
    setAutoStarted(false);
  }

  const value = useMemo<Tutorial>(
    () => ({
      mode,
      zonePrice,
      step,
      steps,
      index,
      phase: practicePhase(step?.id ?? null),
      next,
      tap,
      skip: finish,
      request,
    }),
    [finish, index, mode, next, request, step, steps, tap, zonePrice],
  );

  return (
    <TutorialContext.Provider value={value}>
      <Suspense fallback={null}>
        <StartWhenReady wanted={!active && (requested || (autoStart && !autoStarted))} begin={begin} />
      </Suspense>
      {children}
      {active ? <CourierTour /> : null}
    </TutorialContext.Provider>
  );
}

// Arranca el tutorial cuando el repartidor está en Pedidos (no en Rendiciones ni en otra pantalla).
function StartWhenReady({ wanted, begin }: { wanted: boolean; begin: () => void }) {
  const pathname = usePathname();
  const tab = courierTab(useSearchParams().get("tab"));

  useEffect(() => {
    if (!wanted || pathname !== "/repartidor" || tab !== "pedidos") return;

    // Un cuadro después, para que la pantalla ya esté dibujada y los pasos puedan buscar sus elementos.
    const id = requestAnimationFrame(begin);
    return () => cancelAnimationFrame(id);
  }, [wanted, pathname, tab, begin]);

  return null;
}
