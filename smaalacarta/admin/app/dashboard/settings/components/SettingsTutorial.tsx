"use client";

import { driver } from "driver.js";
import "driver.js/dist/driver.css";

import type { SettingsSection } from "@/lib/settings/sections";

const explanations: Record<string, string> = {
  datos: "Actualizá el nombre y la dirección corta de tu menú. Si cambiás la URL, los enlaces y QR que ya compartiste dejan de funcionar.",
  compartir: "Copiá los enlaces o descargá el QR de los servicios incluidos en tu plan. También podés regenerar la URL a partir del nombre.",
  publicacion: "Activá el menú público cuando esté listo para que tus clientes puedan verlo.",
  apariencia: "Elegí plantilla, colores, tema e imágenes. La vista previa muestra cómo se verá el menú con los cambios actuales.",
  animaciones: "Elegí los movimientos y el fondo que acompañan la experiencia del menú.",
  pdf: "Subí el PDF que querés compartir. Los cambios del archivo se aplican al guardar la configuración.",
  horarios: "Indicá los días y turnos en que atendés. Los clientes verán esta información en el menú.",
  anticipados: "Permití pedidos antes de la apertura y definí hasta cuándo se aceptan para cada día de venta.",
  cierre: "Si no podés atender temporalmente, avisalo y opcionalmente indicá cuándo volvés.",
  "entrega-pago": "Elegí las formas de entrega y pago que aceptás, y completá los datos de transferencia si corresponde.",
  programados: "Definí si recibís pedidos para más tarde y con cuánta anticipación mínima.",
  preparacion: "Elegí si tus clientes ven una hora aproximada de preparación y configurá el tiempo sugerido.",
  contacto: "Completá WhatsApp, dirección y redes para que tus clientes puedan encontrarte.",
  envios: "Configurá las zonas de entrega y sus precios según el tipo de envío disponible para tu negocio.",
  mercadopago: "Conectá o revisá la cuenta de Mercado Pago que usa el negocio para cobrar.",
  contrasena: "Cambiá la contraseña de acceso a tu cuenta. Esta acción se realiza por separado del resto de la configuración.",
};

export default function SettingsTutorial({ sections }: { sections: SettingsSection[] }) {
  function startTour() {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const steps = sections.map(({ id, label }, index) => ({
      element: `#${id}`,
      popover: {
        title: label,
        description: explanations[id] ?? `En esta sección podés configurar ${label.toLowerCase()}.`,
        side: "bottom" as const,
        align: "start" as const,
        progressText: `${index + 1} de ${sections.length}`,
        nextBtnText: "Siguiente",
        prevBtnText: "Anterior",
        doneBtnText: "Listo",
      },
    }));

    driver({
      animate: !reduceMotion,
      smoothScroll: !reduceMotion,
      allowClose: true,
      allowKeyboardControl: true,
      overlayOpacity: 0.58,
      stagePadding: 8,
      stageRadius: 16,
      popoverClass: "sma-settings-tour",
      showProgress: true,
      steps,
    }).drive();
  }

  if (sections.length === 0) return null;

  return (
    <button
      type="button"
      onClick={startTour}
      className="mt-1 min-h-11 shrink-0 rounded-xl border border-line-strong bg-white px-4 text-sm font-semibold text-brand shadow-sm transition hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-accent"
    >
      Ver guía de Configuración
    </button>
  );
}
