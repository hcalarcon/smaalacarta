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

## Conexión por OAuth (en construcción)

Una sola aplicación de Mercado Pago para OAuth; cada negocio conecta su cuenta desde Configuración. Esta
parte (PR 1) solo conecta y desconecta: todavía **no se cobra** con la conexión (eso es el PR 2). Requisitos
`MP-9` a `MP-16` en [SPEC.md](SPEC.md).

Flujo

1. El dueño toca "Conectar Mercado Pago" → `POST /admin/api/mp/oauth/start`: guarda un `state` (solo su
   hash) y el `code_verifier` de PKCE cifrado, y devuelve la URL de `auth.mercadopago.com`.
2. Mercado Pago vuelve a `GET /admin/api/mp/oauth/callback` con `code` y `state`. El servidor consume el
   `state` (un solo uso, 10 minutos, mismo usuario y negocio), canjea el código, confirma con `users/me` que
   la cuenta es la del token y es de Argentina, y guarda los tokens cifrados.
3. Siempre se vuelve a Configuración con un mensaje genérico (`?mp=connected` o `?mp=error`).
4. "Desconectar" → `POST /admin/api/mp/oauth/disconnect`: borra los tokens y deja la conexión en `revoked`.
   No llama a Mercado Pago; el negocio puede revocar el acceso desde su cuenta.

Variables de servidor (nunca `NEXT_PUBLIC_`; valores solo en Vercel, nunca en el repo ni en el chat)

- `MP_OAUTH_CLIENT_ID` y `MP_OAUTH_CLIENT_SECRET`: credenciales de la aplicación de OAuth.
- `MP_TOKEN_ENCRYPTION_KEY`: 32 bytes en base64 (AES-256-GCM de los tokens).
- `MP_OAUTH_ENABLED`: `"true"` o `"false"`; interruptor global.
- `MP_OAUTH_TEST_MODE`: opcional; con `"true"` el canje manda `test_token=true`. Si falta, vale `"false"`.
- `MP_OAUTH_WEBHOOK_SECRET`: lo usa el PR 2.

Puesta en marcha de un negocio (a mano hasta que haya control en /superadmin)

- [ ] Aplicar la migración `20261026000000_mercadopago_oauth.sql` a tu base y correr `npm run db:types`.
- [ ] Variables cargadas en Vercel (Production y Preview) y `MP_OAUTH_ENABLED = true`.
- [ ] URL de redirección de la aplicación: `https://www.smaalacarta.com.ar/admin/api/mp/oauth/callback`.
- [ ] Habilitar el negocio: `update businesses set mp_oauth_enabled = true where id = '<business_id>';`
- [ ] El dueño entra a Configuración → Mercado Pago y conecta con una cuenta de prueba (vendedor).
