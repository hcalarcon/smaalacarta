import type { DbError } from "@/lib/superadmin/messages";

const GENERIC = "No pudimos guardar el cambio. Probá de nuevo.";

// Errores de Postgres (por SQLSTATE) al cambiar o crear pedidos, en español.
export function orderErrorMessage(error: DbError) {
  switch (error.code) {
    case "P0004":
      return "Ese cambio de estado no está permitido.";
    case "P0016":
      return "El barrio del envío no está disponible.";
    case "P0018":
      return "Falta el teléfono del cliente.";
    case "P0019":
      return "Ya lo tomó otro repartidor.";
    case "P0020":
      return "El pedido ya no recibe ofertas.";
    case "P0025":
      return "Tenés que aceptar los términos para repartidores.";
    case "P0023":
      return "Este pedido funciona de otra manera. Actualizá la pantalla.";
    case "P0021":
      return "Contá por qué cambia el precio del envío (de 3 a 140 caracteres).";
    case "P0002":
      return "El pedido no existe.";
    case "P0010":
      return "Tu cuenta está suspendida: no se pueden hacer cambios.";
    case "22023":
      return "Revisá los datos del pedido.";
    case "42501":
      return "No tenés permiso para hacer esto.";
    default:
      return GENERIC;
  }
}

// Errores de cargar un pedido manual (ADMIN-PEDIDOS-39 a 46): los de cualquier pedido y los que la base
// devuelve al validar los productos, la entrega y el pago contra lo que el negocio tiene habilitado.
export function manualOrderErrorMessage(error: DbError) {
  switch (error.code) {
    case "P0001":
      return "Un producto ya no está disponible: actualizá la pantalla y volvé a elegirlo.";
    case "P0007":
      return "El negocio no tiene habilitada esa entrega.";
    case "P0008":
      return "El negocio no tiene habilitado ese medio de pago.";
    case "P0009":
      return "Un producto está sin stock.";
    case "P0014":
      return "Las opciones de un producto no son válidas: revisá lo que eligió.";
    case "P0016":
      return "El barrio no está disponible o tu repartidor favorito no lo cubre.";
    default:
      return orderErrorMessage(error);
  }
}

// Errores de las rendiciones del efectivo (ENVIO-39), en español.
export function settlementErrorMessage(error: DbError) {
  switch (error.code) {
    case "P0004":
      return "Esa rendición ya está marcada o todavía no se puede marcar.";
    case "P0002":
      return "El pedido no existe.";
    case "42501":
      return "No tenés permiso para hacer esto.";
    default:
      return GENERIC;
  }
}
