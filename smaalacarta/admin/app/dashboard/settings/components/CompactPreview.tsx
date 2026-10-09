"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useImageProbe } from "./useImageProbe";
import { CENTER, dragFocus, nudgeFocus, type Focus } from "@/lib/settings/header-focus";
import { MENU_ASSETS_URL, menuPreviewDocument, previewMessage } from "@/lib/settings/menu-preview";

type Props = {
  businessName: string;
  tagline: string;
  template: string;
  theme: string;
  primaryColor: string;
  secondaryColor: string;
  imageUrl: string;
  logoUrl: string;
  focus: Focus;
  onFocusChange: (focus: Focus) => void;
};

// Vista previa compacta de Apariencia (ADMIN-CONFIG-41): la cabecera (degradé de los colores o la
// imagen con su recorte, y el nombre) con el arrastre del punto de enfoque, y una fila con los
// botones reales del menú. La cabecera es nativa; los botones van en un iframe pequeño con el CSS
// real de `web/` para que se vean como en el menú con la plantilla, el tema y los colores elegidos.
export default function CompactPreview({
  businessName,
  tagline,
  template,
  theme,
  primaryColor,
  secondaryColor,
  imageUrl,
  logoUrl,
  focus,
  onFocusChange,
}: Props) {
  const { url, broken, naturalSize, probe, hasImage } = useImageProbe(imageUrl);

  const message = useMemo(
    () =>
      previewMessage({
        name: businessName,
        tagline,
        template,
        primaryColor,
        secondaryColor,
        imageUrl: broken ? "" : url,
        logoUrl,
        focus,
        open: true,
      }),
    [businessName, tagline, template, primaryColor, secondaryColor, broken, url, logoUrl, focus],
  );

  // --- La cabecera nativa -----------------------------------------------------------------------
  const style = {
    ...message.vars,
    backgroundImage: message.background || undefined,
    backgroundSize: "cover",
    backgroundPosition: hasImage ? message.position : undefined,
    color: message.vars["--on-header"],
    textShadow: message.vars["--on-header-shadow"],
    touchAction: "none",
  } as React.CSSProperties;

  const drag = useRef<{ x: number; y: number; focus: Focus } | null>(null);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== undefined && event.button !== 0) return;
    drag.current = { x: event.clientX, y: event.clientY, focus };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start || !naturalSize) return;
    const box = event.currentTarget;
    onFocusChange(
      dragFocus(
        start.focus,
        { x: event.clientX - start.x, y: event.clientY - start.y },
        { w: box.clientWidth, h: box.clientHeight },
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

  // --- La fila de botones (iframe) ----------------------------------------------------------------
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [loads, setLoads] = useState(0);
  const srcDoc = useMemo(
    () => menuPreviewDocument({ template, tema: theme, assetsUrl: MENU_ASSETS_URL, mode: "botones" }),
    [template, theme],
  );
  // Los chips van sobre el degradé de los colores, sin la imagen de cabecera.
  const buttonsMessage = useMemo(
    () => ({ ...message, image: "", background: message.background.startsWith("url(") ? "" : message.background }),
    [message],
  );

  useEffect(() => {
    frameRef.current?.contentWindow?.postMessage(buttonsMessage, "*");
  }, [buttonsMessage, loads]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source === frameRef.current?.contentWindow && event.data?.sma === "ready") {
        setLoads((n) => n + 1);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <div className="space-y-2">
      {probe}

      <div
        tabIndex={0}
        role="group"
        aria-label="Cabecera de la vista previa. Arrastrala, o usá las flechas del teclado, para elegir qué parte de la imagen se ve; con Mayús, de a más."
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onDoubleClick={() => onFocusChange({ x: CENTER, y: CENTER })}
        style={style}
        className={`relative flex h-[6.6rem] select-none flex-col justify-end overflow-hidden rounded-xl p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:h-[7.7rem] ${
          hasImage ? "cursor-grab active:cursor-grabbing" : ""
        } ${message.background ? "" : "bg-stone-100 text-stone-800"}`}
      >
        {message.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={message.logo} alt="" className="mb-1 h-8 w-8 rounded-md bg-white object-cover" />
        ) : null}
        <p className="truncate text-base font-bold leading-tight">{businessName || "Nombre de tu negocio"}</p>
        {tagline ? <p className="truncate text-xs opacity-90">{tagline}</p> : null}

        {hasImage ? (
          <span
            aria-hidden
            className="pointer-events-none absolute -ml-2 -mt-2 h-4 w-4 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(0,0,0,0.55)]"
            style={{ left: `${focus.x}%`, top: `${focus.y}%` }}
          />
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-stone-500">Botones</span>
        {hasImage ? (
          <button
            type="button"
            onClick={() => onFocusChange({ x: CENTER, y: CENTER })}
            disabled={focus.x === CENTER && focus.y === CENTER}
            className="rounded-lg border border-line-strong bg-white px-2.5 py-1 text-xs font-medium text-stone-700 transition hover:bg-brand-soft disabled:opacity-50"
          >
            Centrar imagen
          </button>
        ) : null}
      </div>

      <iframe
        ref={frameRef}
        title="Botones del menú"
        sandbox="allow-scripts"
        srcDoc={srcDoc}
        onLoad={() => setLoads((n) => n + 1)}
        tabIndex={-1}
        className="h-[97px] w-full rounded-xl border border-line"
        style={{ background: "transparent" }}
      />

      {url && broken ? (
        <p className="text-xs text-amber-700">No pudimos cargar esa imagen. Revisá la dirección.</p>
      ) : null}
    </div>
  );
}
