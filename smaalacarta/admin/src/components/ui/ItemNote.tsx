// La nota que el cliente dejó para un producto del pedido (ADMIN-PEDIDOS-22): va destacada, en un
// recuadro, para que el local o el repartidor no la pasen por alto. Es texto del cliente: se dibuja como
// texto (React lo escapa), nunca como HTML.
export default function ItemNote({ note }: { note?: string | null }) {
  const text = typeof note === "string" ? note.trim() : "";

  if (text === "") return null;

  return (
    <p className="mt-1 break-words rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900">
      <span aria-hidden="true">📝 </span>
      <span className="sr-only">Nota del cliente: </span>
      {text}
    </p>
  );
}
