"use client";

import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";

// Se genera en el navegador con la librería `qrcode`: la URL del negocio no
// sale a ningún servicio externo.
export default function ShareQrCode({ value }: { value: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previousValue = useRef(value);
  const [error, setError] = useState(false);
  // Breve destaque cuando el valor cambia, para que se note que el QR se
  // regeneró (si no, un código nuevo se ve igual que el anterior a simple vista).
  const [justUpdated, setJustUpdated] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setError(false);
    QRCode.toCanvas(canvas, value, { width: 200, margin: 1 }).catch(() =>
      setError(true),
    );

    if (previousValue.current !== value) {
      previousValue.current = value;
      setJustUpdated(true);
      const timeout = setTimeout(() => setJustUpdated(false), 1000);
      return () => clearTimeout(timeout);
    }
  }, [value]);

  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement("a");
    link.download = "codigo-qr.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <canvas
        ref={canvasRef}
        width={200}
        height={200}
        className={`rounded-xl border transition-all duration-500 ${
          justUpdated
            ? "scale-105 border-accent ring-4 ring-accent/30"
            : "border-line"
        }`}
      />

      {error ? (
        <p className="text-sm text-red-600">No pudimos generar el código.</p>
      ) : (
        <button
          type="button"
          onClick={download}
          className="rounded-xl border border-line-strong bg-white px-4 py-2 text-sm font-medium text-brand transition hover:bg-brand-soft"
        >
          Descargar QR
        </button>
      )}
    </div>
  );
}
