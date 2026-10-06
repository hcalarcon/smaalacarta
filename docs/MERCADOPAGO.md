# Mercado Pago — guía de puesta en marcha

Cobro con Checkout Pro. Fase 1: solo el negocio de Herni. Las pantallas de Mercado Pago cambian seguido: confirmá en el panel de Developers.

Nunca van claves ni tokens reales en este archivo, en el repo ni en el chat: solo marcadores como `<business_id>`.

## Negocio propio (fase 1)

Antes del PR

- [ ] Cuenta de Mercado Pago verificada (identidad) y con retiro configurado (cuenta bancaria o CVU).
- [ ] Mercado Pago Developers: crear una aplicación de Checkout Pro.
- [ ] Guardar credenciales de prueba y de producción en un gestor de contraseñas. Nunca en el repo, en el chat ni en Claude.
- [ ] Crear dos usuarios de prueba (vendedor y comprador) y anotar las tarjetas de prueba (aprobada y rechazada).

Con el PR mergeado

- [ ] Aplicar la migración a la base propia (apagar el servidor antes).
- [ ] INSERT en `payment_credentials` (access token, secret del webhook, `enabled = true`) desde el SQL editor de Supabase.
  Con marcadores (los valores reales los pegás vos, nunca en el repo ni en el chat):
  `insert into payment_credentials (business_id, mp_access_token, mp_webhook_secret, enabled) values ('<business_id>', '<access token>', '<secret del webhook>', true);`
  La clave secreta del webhook la da Mercado Pago al guardar la URL del paso siguiente: si todavía no la tenés, insertá con un valor provisorio y `enabled = false`, y después `update payment_credentials set mp_webhook_secret = '<secret del webhook>', enabled = true where business_id = '<business_id>';`.
- [ ] En la aplicación de Mercado Pago, Notificaciones: URL `https://www.smaalacarta.com.ar/admin/api/mp/webhook?b=<business_id>`, evento "Pagos", y guardar la clave secreta.
- [ ] En Configuración del negocio: tildar "Mercado Pago" como medio de pago.

Pruebas

- [ ] Pedido pagado con tarjeta de prueba aprobada: pasa a "Pagado" y la página de vuelta lo confirma.
- [ ] Tarjeta rechazada y pago abandonado ("Esperando pago").
- [ ] Pedido anticipado pagado con Mercado Pago.
- [ ] Pasar a credenciales de producción (UPDATE de la fila) y pagar $100 o menos desde otra cuenta; confirmar que acredita.
- [ ] Revisar si Mercado Pago exige certificación de la integración antes de producción.

## Cada negocio nuevo

Recomendado: esperar la conexión por OAuth (una sola aplicación de SMA a la Carta; cada negocio conecta su cuenta con un botón en Configuración, un solo webhook y una sola clave). Está pendiente como tarea [por asignar] en [PLAN.md](PLAN.md). Mientras no exista, y solo para uno o dos conocidos:

- [ ] El negocio tiene su cuenta de Mercado Pago verificada y con retiro configurado.
- [ ] El negocio crea su propia aplicación de Checkout Pro (acompañado, sin pasar datos por chat).
- [ ] Carga sus credenciales en `payment_credentials` sin que pasen por nadie más.
- [ ] Configura en su aplicación el webhook con `?b=<su business_id>`.
- [ ] Tiene el plan "Pedidos Online" y "Mercado Pago" tildado en Configuración.
- [ ] Prueba con credenciales de prueba y un pago real chico.
- [ ] Se le avisa que la comisión de Mercado Pago la paga el vendedor y que el dinero se acredita según la configuración de su cuenta.
