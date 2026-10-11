"use client";

import { usePwa } from "./pwa-store";

// Va dentro del formulario de "Salir" (ADMIN-PWA-29): le dice a la acción qué aparato se está yendo, para
// sacarlo de la cuenta antes de cerrar la sesión. Así un aparato compartido no sigue mostrando los pedidos
// de quien ya salió. No pinta nada.
export default function PushEndpointField() {
  const { endpoint } = usePwa();

  return endpoint ? <input type="hidden" name="pushEndpoint" value={endpoint} /> : null;
}
