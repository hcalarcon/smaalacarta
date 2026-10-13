import { whatsappDigits } from "./courier";

// El seguimiento del pedido manual (ADMIN-PEDIDOS-48): después de cargarlo, el local le manda al cliente el
// link `/pedido/<código>` por WhatsApp. Sin teléfono, se muestra el link para copiar.

export type FollowupInput = {
  customerName: string;
  businessName: string;
  number: string | number;
  link: string;
  // "Buscar repartidor": el cliente elige desde el seguimiento quién se lo lleva.
  chooseCourier: boolean;
};

export function followupMessage(input: FollowupInput): string {
  const name = input.customerName.trim();
  const greeting = name ? `Hola ${name}!` : "Hola!";
  const lines = [`${greeting} Tu pedido #${input.number} en ${input.businessName} está confirmado.`];

  if (input.chooseCourier) {
    lines.push("Entrá al link para elegir quién te lo lleva y seguir el pedido:");
  } else {
    lines.push("Podés seguirlo desde acá:");
  }

  lines.push(input.link);

  return lines.join("\n");
}

// El mismo formato de link que arma el menú (`api.whatsapp.com/send`). Sin teléfono, null.
export function followupWhatsappUrl(phone: string | null | undefined, message: string): string | null {
  const digits = whatsappDigits(phone);
  if (!digits) return null;

  return `https://api.whatsapp.com/send?phone=${digits}&text=${encodeURIComponent(message)}`;
}
