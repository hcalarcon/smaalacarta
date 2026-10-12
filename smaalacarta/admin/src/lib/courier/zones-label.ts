// Cuántas zonas tiene tildadas un local, para el detalle del superadmin (ENVIO-136): de un vistazo se
// ve si el envío quedó listo.
export function zonesLabel(count: number): string {
  if (count <= 0) return "Sin zonas";
  return count === 1 ? "1 zona" : `${count} zonas`;
}
