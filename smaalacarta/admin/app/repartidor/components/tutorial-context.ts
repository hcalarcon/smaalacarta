"use client";

import { createContext, useContext } from "react";

import type { PracticePhase, TutorialMode, TutorialStep, TutorialStepId } from "@/lib/courier/tutorial";

// El elemento visible con ese `data-tour`: en el celular y en la computadora la pantalla repite algunos (la barra
// de abajo y el menú lateral), y solo uno se ve.
export function findTourTarget(name: string): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`);

  for (const node of nodes) {
    if (node.getClientRects().length > 0) return node;
  }

  return null;
}

export type Tutorial = {
  mode: TutorialMode;
  zonePrice: number | null;
  // El paso actual; nulo con el tutorial cerrado.
  step: TutorialStep | null;
  steps: TutorialStep[];
  index: number;
  // Qué versión del pedido de práctica se ve ahora; nula si no se ve.
  phase: PracticePhase | null;
  next: () => void;
  // El repartidor tocó el botón real del pedido de práctica: avanza solo si el paso actual lo esperaba.
  tap: (expected: TutorialStepId) => void;
  skip: () => void;
  // "¿Cómo funciona?": lleva a Pedidos y arranca el tutorial.
  request: () => void;
};

export const TutorialContext = createContext<Tutorial | null>(null);

// Nulo fuera del panel del repartidor (y en las pruebas de las tarjetas): ahí no hay tutorial.
export function useTutorial(): Tutorial | null {
  return useContext(TutorialContext);
}

