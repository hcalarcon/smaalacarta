// Cómo se llama cada tipo de entrega y cada medio de pago de un pedido (ADMIN-PEDIDOS-43 y 44). Los valores
// son los de la base: `local` y `qr` solo existen en el pedido manual. Lo que no se conoce (un pedido manual
// de antes, con texto libre) se muestra tal cual.

const DELIVERY_LABELS: Record<string, string> = {
  delivery: "Envío a domicilio",
  retiro: "Retiro en el local",
  local: "Consumo en el local",
};

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  mercadopago: "Mercado Pago",
  qr: "QR / billetera virtual",
};

const label = (labels: Record<string, string>, value: string | null | undefined) => {
  const text = (value ?? "").trim();
  if (!text) return "";

  return labels[text] ?? text;
};

export const deliveryLabel = (value: string | null | undefined) => label(DELIVERY_LABELS, value);

export const paymentLabel = (value: string | null | undefined) => label(PAYMENT_LABELS, value);
