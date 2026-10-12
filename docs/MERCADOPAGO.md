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
parte (PR 1) conecta y desconecta; el cobro con la conexión es el PR 2 (sección siguiente). Requisitos `MP-9` a
`MP-17` en [SPEC.md](SPEC.md).

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
- `MP_OAUTH_WEBHOOK_SECRET`: la clave secreta de las notificaciones de la aplicación de OAuth (PR 2). Se lee al
  llamar; sin ella, el webhook de un negocio conectado solo valida con la clave manual del negocio, si la tiene.

Puesta en marcha de un negocio (a mano hasta que haya control en /superadmin)

- [ ] Aplicar la migración `20261026000000_mercadopago_oauth.sql` a tu base y correr `npm run db:types`.
- [ ] Variables cargadas en Vercel (Production y Preview) y `MP_OAUTH_ENABLED = true`.
- [ ] URL de redirección de la aplicación: `https://www.smaalacarta.com.ar/admin/api/mp/oauth/callback`.
- [ ] Habilitar el negocio: `update businesses set mp_oauth_enabled = true where id = '<business_id>';`
- [ ] El dueño entra a Configuración → Mercado Pago y conecta con una cuenta de prueba (vendedor).

### Cobro con la conexión (PR 2)

Requisitos `MP-18` a `MP-26` en [SPEC.md](SPEC.md). Con la cuenta del negocio en `connected`:

- **Qué token se usa.** `/create`, `/verify` y `/webhook` usan primero la conexión; si no hay una `connected`, siguen
  con `payment_credentials` como siempre. Cobrar no depende de `MP_OAUTH_ENABLED` ni de `mp_oauth_enabled`: esos solo
  gobiernan conectar.
- **Renovación.** El token dura 180 días. Cuando le quedan menos de 30 (o ya venció), se renueva al usarlo, con
  `grant_type=refresh_token`. Mercado Pago devuelve un token y un `refresh_token` NUEVOS (el viejo deja de servir),
  así que la renovación la hace un solo pedido a la vez (arriendo de 30 segundos en `refreshing_until`); los demás
  usan el token vigente o esperan unos segundos. No hay cron: un negocio que no cobra no renueva, y su token
  vence a los 180 días (la renovación necesita que haya sido autorizada con `offline_access`).
- **`needs_reconnect`.** Solo lo marca un `invalid_grant` de Mercado Pago al renovar (rechazó ese refresh_token).
  Un `invalid_client` (client_secret equivocado o rotado), un `invalid_request`, un 400 o 401 sin código, un error de
  red, un 5xx o perder la carrera no lo marcan: es un problema de configuración o pasajero y se ve en los logs como
  `mp/credentials: no se pudo renovar el token <HTTP> <código>`. Si aparece `invalid_client`, revisá
  `MP_OAUTH_CLIENT_ID` y `MP_OAUTH_CLIENT_SECRET` en Vercel. Con la conexión en `needs_reconnect` y sin credenciales manuales habilitadas: la opción
  desaparece del menú, `/create` responde 409 `not_configured` y el webhook responde 200 sin consultar a Mercado Pago.
  El dueño reconecta desde Configuración (la tarjeta con el aviso es el PR 3).
- **Webhook.** Se valida con `MP_OAUTH_WEBHOOK_SECRET` (o con la clave manual del negocio, para un aviso viejo) y el
  `collector_id` del pago tiene que ser el `mp_user_id` de la conexión. Mercado Pago tiene que notificar a
  `https://www.smaalacarta.com.ar/admin/api/mp/webhook?b=<business_id>`: la preferencia ya lo manda en `notification_url`,
  y el evento "Pagos" y la clave secreta se configuran una sola vez en la aplicación de OAuth.

Procedimiento de emergencia (parar el cobro de UN negocio). En el SQL editor de Supabase; oculta Mercado Pago del menú
y del pedido y deja de cobrar, sin tocar nada más (las credenciales manuales, si las hay, siguen):

```sql
-- Parar:
update payment_connections set status = 'needs_reconnect' where business_id = '<business_id>';
-- Quitar la conexión del todo (borra los tokens; el negocio puede volver a conectar):
update payment_connections set status = 'revoked', access_token_enc = null, refresh_token_enc = null,
  expires_at = null where business_id = '<business_id>';
```

Para volver a cobrar después de un `needs_reconnect` puesto a mano: `update payment_connections set status =
'connected' where business_id = '<business_id>';` (los tokens siguen guardados).

Cómo probarlo con usuarios de prueba (vendedor y comprador)

- [ ] Aplicar `20261027000000_mercadopago_oauth_cobro.sql` a tu base y correr `npm run db:types` (los tipos de
  `refreshing_until` y `business_has_mp` se escribieron a mano).
- [ ] Conectar el negocio de prueba con la cuenta de vendedor (sección anterior); con `MP_OAUTH_TEST_MODE=true` si
  se usan credenciales de sandbox.
- [ ] Hacer un pedido con Mercado Pago, pagar con el comprador de prueba y ver que pasa a "Pagado". En
  `notifications_history` de la aplicación de OAuth tiene que figurar el aviso entregado (200).
- [ ] Confirmar en los logs de Vercel que no hay "collector distinto"; si aparece con un pago real, el campo
  `collector_id` no es el que se supuso.
- [ ] Probar la renovación: `update payment_connections set expires_at = now() + interval '5 days' where business_id =
  '<business_id>';`, hacer un pedido y pagarlo; `expires_at` tiene que volver a unos 180 días y el pago tiene que
  entrar. Repetirlo con dos pedidos a la vez.
- [ ] Revocar el acceso desde la cuenta de Mercado Pago del vendedor y hacer otro pedido: el siguiente intento de
  renovar tiene que dejar la conexión en `needs_reconnect`.
