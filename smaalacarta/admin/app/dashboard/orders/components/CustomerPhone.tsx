import { chatLink, telLink } from "@/lib/courier/panel";

// El teléfono del cliente con sus dos atajos: llamar y escribirle por WhatsApp (ENVIO-85). El menú lo
// pide siempre, así que todo pedido nuevo lo trae; los muy viejos pueden no tenerlo.
export default function CustomerPhone({
  phone,
  compact = false,
}: {
  phone: string | null;
  compact?: boolean;
}) {
  const call = telLink(phone);
  if (!phone || !call) return null;

  const chat = chatLink(phone);

  const linkClass = compact
    ? "rounded-md border border-line-strong px-1.5 py-0.5 text-[11px] font-medium text-brand transition hover:bg-brand-soft"
    : "rounded-lg border border-line-strong px-2.5 py-1 text-xs font-medium text-brand transition hover:bg-brand-soft";

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${compact ? "text-xs" : "text-sm"} text-stone-600`}>
      <span aria-hidden>📞</span>
      <span>{phone}</span>
      <a href={call} className={linkClass}>
        Llamar
      </a>
      {chat ? (
        <a href={chat} target="_blank" rel="noopener noreferrer" className={linkClass}>
          WhatsApp
        </a>
      ) : null}
    </div>
  );
}
