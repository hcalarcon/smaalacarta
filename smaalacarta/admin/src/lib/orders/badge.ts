import { badgeLabel } from "./urgent-alert";

// El globito con la cantidad de pendientes (ADMIN-PEDIDOS-28): en el favicon, dibujado en un canvas, y en
// el ícono de la app instalada con la Badging API. Todo opcional: si el navegador no lo tiene, no rompe.

type BadgingNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export async function setAppBadgeSafe(count: number): Promise<void> {
  try {
    const nav = navigator as BadgingNavigator;

    if (count > 0 && typeof nav.setAppBadge === "function") await nav.setAppBadge(count);
    else if (count <= 0 && typeof nav.clearAppBadge === "function") await nav.clearAppBadge();
  } catch {
    // Sin permiso o sin soporte: el globito del ícono es un extra.
  }
}

export async function clearAppBadgeSafe(): Promise<void> {
  await setAppBadgeSafe(0);
}

const SIZE = 64;

function iconLink(): HTMLLinkElement | null {
  return document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
}

// El `href` del ícono antes de ponerle el globito, para devolverlo.
let originalHref: string | null = null;

function drawBadge(base: CanvasImageSource | null, label: string): string | null {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;

  const context = canvas.getContext("2d");
  if (!context) return null;

  context.clearRect(0, 0, SIZE, SIZE);
  if (base) context.drawImage(base, 0, 0, SIZE, SIZE);

  // El círculo rojo arriba a la derecha, con la cantidad en blanco.
  const radius = SIZE * 0.3;
  const cx = SIZE - radius;
  const cy = radius;

  context.beginPath();
  context.arc(cx, cy, radius, 0, Math.PI * 2);
  context.fillStyle = "#dc2626";
  context.fill();
  context.fillStyle = "#ffffff";
  context.font = `bold ${label.length > 1 ? 24 : 30}px sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, cx, cy + 1);

  try {
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

export function restoreFavicon(): void {
  const link = iconLink();
  if (link && originalHref !== null) link.setAttribute("href", originalHref);
  originalHref = null;
}

// Pone (o saca, con 0) el globito en el ícono de la pestaña.
export function updateFavicon(count: number): void {
  const link = iconLink();
  if (!link) return;

  if (count <= 0) {
    restoreFavicon();
    return;
  }

  originalHref ??= link.getAttribute("href");
  const label = badgeLabel(count);
  const source = originalHref;

  const apply = (base: CanvasImageSource | null) => {
    const url = drawBadge(base, label);
    // Si en el medio la cantidad volvió a cero, `originalHref` ya se limpió: no pisar el original.
    if (url && originalHref !== null) link.setAttribute("href", url);
  };

  // Primero el círculo solo, sin esperar; si el ícono original carga, se redibuja encima de él.
  apply(null);

  if (source && typeof Image !== "undefined") {
    const image = new Image();
    image.onload = () => apply(image);
    image.src = source;
  }
}
