"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useImageProbe } from "./useImageProbe";
import { CENTER, dragFocus, nudgeFocus, type Focus } from "@/lib/settings/header-focus";
import { MENU_ASSETS_URL, previewSrc } from "@/lib/settings/live-preview";

// Cuánto se espera a que el menú dibuje la cabecera antes de dar la vista previa por caída.
const LOAD_TIMEOUT_MS = 12000;
const SEND_DEBOUNCE_MS = 150;

type Rect = { x: number; y: number; w: number; h: number };

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function parseRect(data: unknown): Rect | null {
  const rect = (data as { rect?: Record<string, unknown> } | null)?.rect;
  if (!rect || !finite(rect.x) || !finite(rect.y) || !finite(rect.w) || !finite(rect.h)) return null;
  return rect.w > 0 && rect.h > 0 ? { x: rect.x, y: rect.y, w: rect.w, h: rect.h } : null;
}

// El menú real (`web/apps/menu-app?preview=1`) en un iframe (ADMIN-CONFIG-44 a 47). Recibe la
// configuración y el menú por `postMessage`, con un pequeño retraso mientras se escribe y enseguida
// cuando el iframe avisa que cargó. Sobre la cabecera, usando el rectángulo que informa el iframe, se
// superpone el arrastre del punto de enfoque de la imagen; las flechas y el doble clic también sirven.
export default function MenuPreviewFrame({
  title,
  payload,
  imageUrl,
  focus,
  onFocusChange,
  width,
  height,
  cropHeight,
  adminOrigin,
}: {
  title: string;
  // Lo que se le manda al menú (ver `previewPayload`).
  payload: { type: "preview"; config: object; menu: object };
  imageUrl: string;
  focus: Focus;
  onFocusChange: (focus: Focus) => void;
  // Tamaño del iframe, en píxeles del menú (390 de ancho es un celular).
  width: number;
  height: number;
  // Si se pasa, solo se ve esa altura de arriba (la vista compacta).
  cropHeight?: number;
  adminOrigin?: string;
}) {
  const { naturalSize, probe, hasImage } = useImageProbe(imageUrl);

  const frameRef = useRef<HTMLIFrameElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [failedAttempt, setFailedAttempt] = useState<number | null>(null);

  const menuOrigin = useMemo(() => new URL(MENU_ASSETS_URL).origin, []);
  const src = previewSrc(MENU_ASSETS_URL, adminOrigin);

  // Lo que escucha el iframe: solo se acepta lo que viene de él y de la dirección del menú.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== frameRef.current?.contentWindow || event.origin !== menuOrigin) return;
      const data = event.data as { type?: string } | null;

      if (data?.type === "preview-ready") {
        setReady((n) => n + 1);
      } else if (data?.type === "preview-header") {
        const next = parseRect(data);
        if (next) setRect(next);
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [menuOrigin]);

  // Cada cambio se manda con un pequeño retraso; al cargar el iframe, enseguida.
  const send = useRef(() => {});
  useEffect(() => {
    send.current = () => frameRef.current?.contentWindow?.postMessage(payload, menuOrigin);
  });

  const payloadKey = JSON.stringify(payload);
  useEffect(() => {
    if (ready === 0) return;
    const timer = setTimeout(() => send.current(), SEND_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [payloadKey, ready]);

  useEffect(() => {
    if (ready > 0) send.current();
  }, [ready]);

  // Sin respuesta del menú (sin conexión, dirección mal puesta, bloqueado): se avisa y se puede reintentar.
  useEffect(() => {
    if (rect) return;
    const timer = setTimeout(() => setFailedAttempt(attempt), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [attempt, rect]);
  const failed = !rect && failedAttempt === attempt;

  function retry() {
    setRect(null);
    setReady(0);
    setAttempt((n) => n + 1);
  }

  // Ancho disponible, para achicar el menú.
  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setBoxWidth(entry.contentRect.width));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const scale = boxWidth > 0 ? Math.min(1, boxWidth / width) : 1;
  const visibleHeight = cropHeight ?? height;

  // --- Arrastre del punto de enfoque, sobre la cabecera -----------------------------------------
  const drag = useRef<{ x: number; y: number; focus: Focus } | null>(null);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== undefined && event.button !== 0) return;
    drag.current = { x: event.clientX, y: event.clientY, focus };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start || !naturalSize || !rect) return;
    // El gesto se mide en píxeles de pantalla; el rectángulo, en los del menú (sin la escala).
    onFocusChange(
      dragFocus(
        start.focus,
        { x: (event.clientX - start.x) / scale, y: (event.clientY - start.y) / scale },
        { w: rect.w, h: rect.h },
        naturalSize,
      ),
    );
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const next = nudgeFocus(focus, event.key, event.shiftKey);
    if (!next) return;
    event.preventDefault();
    onFocusChange(next);
  }

  return (
    <div className="space-y-2">
      {probe}

      <div
        tabIndex={0}
        role="group"
        aria-label="Vista previa del menú. Con las flechas del teclado movés el punto de enfoque de la imagen de cabecera; con Mayús, de a más."
        onKeyDown={onKeyDown}
        className="rounded-2xl border border-line-strong bg-stone-100 p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <div ref={boxRef} className="flex justify-center overflow-hidden rounded-xl">
          <div
            className="relative overflow-hidden"
            style={{ width: width * scale, height: visibleHeight * scale }}
          >
            <iframe
              key={attempt}
              ref={frameRef}
              title={title}
              sandbox="allow-scripts allow-same-origin"
              src={src}
              tabIndex={-1}
              style={{
                width,
                height,
                border: 0,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                background: "#fff",
              }}
            />

            {rect && hasImage ? (
              <div
                data-testid="header-drag"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={() => (drag.current = null)}
                onPointerCancel={() => (drag.current = null)}
                onDoubleClick={() => onFocusChange({ x: CENTER, y: CENTER })}
                className="absolute cursor-grab active:cursor-grabbing"
                style={{
                  left: rect.x * scale,
                  top: rect.y * scale,
                  width: rect.w * scale,
                  height: rect.h * scale,
                  touchAction: "none",
                }}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute -ml-2 -mt-2 h-4 w-4 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(0,0,0,0.55)]"
                  style={{ left: `${focus.x}%`, top: `${focus.y}%` }}
                />
              </div>
            ) : null}

            {!rect ? (
              <div
                role={failed ? "alert" : "status"}
                className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/80 p-3 text-center text-sm text-stone-600"
              >
                {failed ? (
                  <>
                    <p>No pudimos conectar con el menú para mostrar la vista previa.</p>
                    <button
                      type="button"
                      onClick={retry}
                      className="rounded-lg border border-line-strong bg-white px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-brand-soft"
                    >
                      Reintentar
                    </button>
                  </>
                ) : (
                  <p>Cargando vista previa…</p>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {hasImage ? (
        <button
          type="button"
          onClick={() => onFocusChange({ x: CENTER, y: CENTER })}
          disabled={focus.x === CENTER && focus.y === CENTER}
          className="rounded-lg border border-line-strong bg-white px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-brand-soft disabled:opacity-50"
        >
          Centrar imagen
        </button>
      ) : null}
    </div>
  );
}
