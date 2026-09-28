// Negocio suspendido (`active = false`, ADMIN-SUSPENSION-1): no se ve al
// público en ningún servicio, y tampoco se puede editar desde acá (lo exige
// la base, con un mensaje en español en cada acción). Este aviso es solo para
// que quede claro por qué, sin tener que llegar a intentar guardar algo.
export default function SuspendedBanner() {
  return (
    <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-800 md:px-6 lg:px-8">
      Tu cuenta está suspendida: el menú no se muestra al público y no se
      pueden guardar cambios. Contactá a SMA a la Carta para reactivarla.
    </div>
  );
}
