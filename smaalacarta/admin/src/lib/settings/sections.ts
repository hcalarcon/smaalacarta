export type SettingsSection = { id: string; label: string };

// Las secciones de Configuración que el plan deja ver, en el orden de la pantalla
// (ADMIN-CONFIG-22). Los ids son los de cada <Section id=…>.
export function settingsSections({
  digitalMenu,
  pdfService,
  courierDelivery = false,
}: {
  digitalMenu: boolean;
  pdfService: boolean;
  // El negocio tiene el envío con repartidor habilitado (ENVIO-58).
  courierDelivery?: boolean;
}): SettingsSection[] {
  return [
    { id: "datos", label: "Datos del negocio" },
    { id: "compartir", label: "Compartir" },
    ...(digitalMenu
      ? [
          { id: "publicacion", label: "Publicación" },
          { id: "apariencia", label: "Apariencia" },
        ]
      : []),
    ...(pdfService ? [{ id: "pdf", label: "Menú en PDF" }] : []),
    ...(digitalMenu
      ? [
          { id: "horarios", label: "Horarios" },
          { id: "anticipados", label: "Pedidos anticipados" },
          { id: "cierre", label: "Cierre temporal" },
          { id: "entrega-pago", label: "Entrega y pago" },
          { id: "programados", label: "Pedidos programados" },
          { id: "contacto", label: "Contacto" },
        ]
      : []),
    ...(courierDelivery ? [{ id: "envios", label: "Envíos" }] : []),
    { id: "contrasena", label: "Contraseña" },
  ];
}
