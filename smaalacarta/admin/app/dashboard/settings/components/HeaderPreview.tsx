"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { CENTER, dragFocus, nudgeFocus, type Focus, type Size } from "@/lib/settings/header-focus";
import {
  MENU_ASSETS_URL,
  menuPreviewDocument,
  previewMessage,
} from "@/lib/settings/menu-preview";
import { TEMPLATES, THEMES } from "@/lib/settings/validation";

type Format = "celular" | "escritorio";

// Tamaños reales de cada formato: el menú se dibuja con el ancho de un celular o de una
// pantalla de escritorio (desktop.css entra desde 1024 px) y se achica para que entre.
const FORMATS: Record<Format, { label: string; width: number; height: number }> = {
  celular: { label: "Celular", width: 390, height: 640 },
  escritorio: { label: "Escritorio", width: 1120, height: 620 },
};

// Un valor que sigue al del formulario hasta que se lo cambia a mano en la vista previa; cuando el
// formulario cambia el suyo, vuelve a seguirlo.
function useFollowed<T>(source: T) {
  const [state, setState] = useState({ source, value: source });
  if (state.source !== source) setState({ source, value: source });
  return [state.value, (value: T) => setState({ source, value })] as const;
}

const pill = (active: boolean) =>
  `rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
    active ? "border-brand bg-brand text-white" : "border-line-strong bg-white text-stone-700 hover:bg-brand-soft"
  }`;

// Vista previa fiel del menú (ADMIN-CONFIG-28 a 30) y selector del punto de enfoque de la imagen de
// cabecera (ADMIN-CONFIG-27). Un error de carga de la imagen se recuerda por dirección, así que al
// cambiarla se vuelve a intentar (ADMIN-CONFIG-24).
export default function HeaderPreview({
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
}: {
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
}) {
  const url = imageUrl.trim();
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ url: string; size: Size } | null>(null);
  const broken = brokenUrl === url;
  const naturalSize = imageSize && imageSize.url === url ? imageSize.size : null;

  const [previewTemplate, setPreviewTemplate] = useFollowed(template);
  const [previewTheme, setPreviewTheme] = useFollowed(theme);
  const [open, setOpen] = useState(true);
  const [format, setFormat] = useState<Format>("celular");

  const frameRef = useRef<HTMLIFrameElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(0);
  const [loads, setLoads] = useState(0);

  const srcDoc = useMemo(
    () => menuPreviewDocument({ template: previewTemplate, tema: previewTheme, assetsUrl: MENU_ASSETS_URL }),
    [previewTemplate, previewTheme],
  );

  const message = useMemo(
    () =>
      previewMessage({
        name: businessName,
        tagline,
        template: previewTemplate,
        primaryColor,
        secondaryColor,
        imageUrl: broken ? "" : url,
        logoUrl,
        focus,
        open,
      }),
    [businessName, tagline, previewTemplate, primaryColor, secondaryColor, broken, url, logoUrl, focus, open],
  );

  // El estado del negocio viaja como datos al iframe, cada vez que cambia o que el iframe recarga.
  useEffect(() => {
    frameRef.current?.contentWindow?.postMessage(message, "*");
  }, [message, loads]);

  // Ancho disponible, para achicar el formato de escritorio.
  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setBoxWidth(entry.contentRect.width));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  // Gestos sobre la cabecera del iframe: arrastrar mueve el punto, doble clic lo centra.
  const startFocus = useRef<Focus>(focus);
  const latest = useRef({ focus, naturalSize, onFocusChange });
  useEffect(() => {
    latest.current = { focus, naturalSize, onFocusChange };
  });

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as {
        sma?: string;
        phase?: string;
        dx?: number;
        dy?: number;
        w?: number;
        h?: number;
      } | null;
      if (!data || typeof data !== "object") return;

      const { focus: current, naturalSize: image, onFocusChange: change } = latest.current;

      if (data.sma === "ready") {
        setLoads((n) => n + 1);
      } else if (data.sma === "center") {
        change({ x: CENTER, y: CENTER });
      } else if (data.sma === "drag") {
        if (data.phase === "start") {
          startFocus.current = current;
        } else if (data.phase === "move" && image) {
          change(
            dragFocus(
              startFocus.current,
              { x: Number(data.dx) || 0, y: Number(data.dy) || 0 },
              { w: Number(data.w) || 0, h: Number(data.h) || 0 },
              image,
            ),
          );
        }
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  function handleKeyDown(event: React.KeyboardEvent) {
    const next = nudgeFocus(focus, event.key, event.shiftKey);
    if (!next) return;
    event.preventDefault();
    onFocusChange(next);
  }

  const spec = FORMATS[format];
  const scale = format === "escritorio" && boxWidth > 0 ? Math.min(1, boxWidth / spec.width) : 1;
  const hasImage = Boolean(url) && !broken;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-brand">Vista previa del menú</span>
        <div className="flex gap-1.5" role="group" aria-label="Formato de la vista previa">
          {(Object.keys(FORMATS) as Format[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFormat(key)}
              aria-pressed={format === key}
              className={pill(format === key)}
            >
              {FORMATS[key].label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Plantilla de la vista previa">
          {TEMPLATES.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setPreviewTemplate(option.key)}
              aria-pressed={previewTemplate === option.key}
              className={pill(previewTemplate === option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Tema de la vista previa">
          {THEMES.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setPreviewTheme(option.key)}
              aria-pressed={previewTheme === option.key}
              className={pill(previewTheme === option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Estado del negocio en la vista previa">
          <button type="button" onClick={() => setOpen(true)} aria-pressed={open} className={pill(open)}>
            Abierto
          </button>
          <button type="button" onClick={() => setOpen(false)} aria-pressed={!open} className={pill(!open)}>
            Cerrado
          </button>
        </div>
      </div>

      {/* Sirve para saber si la imagen carga y qué medidas tiene (el arrastre las necesita). */}
      {url && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          className="hidden"
          onLoad={(event) =>
            setImageSize({
              url,
              size: { w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight },
            })
          }
          onError={() => setBrokenUrl(url)}
        />
      ) : null}

      <div
        tabIndex={0}
        role="group"
        aria-label="Vista previa de la cabecera. Con las flechas del teclado movés el punto de enfoque de la imagen; con Mayús, de a más."
        onKeyDown={handleKeyDown}
        className="rounded-2xl border border-line-strong bg-stone-100 p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <div ref={boxRef} className="flex justify-center overflow-hidden rounded-xl">
          <div style={{ width: spec.width * scale, height: spec.height * scale }}>
            <iframe
              ref={frameRef}
              title="Vista previa del menú"
              sandbox="allow-scripts"
              srcDoc={srcDoc}
              onLoad={() => setLoads((n) => n + 1)}
              tabIndex={-1}
              style={{
                width: spec.width,
                height: spec.height,
                border: 0,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                background: "#fff",
              }}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-stone-500">
          {hasImage
            ? "Arrastrá la cabecera para elegir qué parte de la imagen se ve (también con las flechas). Doble clic la centra."
            : "Así ven tus clientes el menú, con tus colores y la plantilla elegida."}
        </p>
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

      {url && broken ? (
        <p className="text-sm text-amber-700">No pudimos cargar esa imagen. Revisá la dirección.</p>
      ) : null}
    </div>
  );
}
