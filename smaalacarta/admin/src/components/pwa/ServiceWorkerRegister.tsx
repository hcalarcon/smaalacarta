"use client";

import { useEffect } from "react";

import { start } from "./pwa-store";

// Registra el service worker y empieza a mirar la instalación y los avisos. Se monta en los layouts del
// negocio y del repartidor (los que pasan `showAppControls`): no pinta nada.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    start();
  }, []);

  return null;
}
