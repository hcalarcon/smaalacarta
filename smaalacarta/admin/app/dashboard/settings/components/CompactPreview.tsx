"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import HeaderPreview from "./HeaderPreview";
import type { Focus } from "@/lib/settings/header-focus";
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

// Vista previa compacta de Apariencia (ADMIN-CONFIG-41): la parte de arriba del menú (la misma vista
// del modal, con el CSS real, achicada) con el arrastre del punto de enfoque, y una fila con los botones
// reales del menú en un iframe pequeño.
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
  const message = useMemo(
    () =>
      previewMessage({
        name: businessName,
        tagline,
        template,
        primaryColor,
        secondaryColor,
        imageUrl: "",
        logoUrl,
        focus,
        open: true,
      }),
    [businessName, tagline, template, primaryColor, secondaryColor, logoUrl, focus],
  );

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
      <HeaderPreview
        compact
        businessName={businessName}
        tagline={tagline}
        template={template}
        theme={theme}
        primaryColor={primaryColor}
        secondaryColor={secondaryColor}
        imageUrl={imageUrl}
        logoUrl={logoUrl}
        focus={focus}
        onFocusChange={onFocusChange}
      />

      <span className="block text-xs font-medium text-stone-500">Botones</span>

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
    </div>
  );
}
