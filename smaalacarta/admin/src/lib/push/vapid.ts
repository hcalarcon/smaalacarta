// La clave pública VAPID viaja en base64 de URL; `pushManager.subscribe` la quiere en bytes.
export function urlBase64ToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));

  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);

  return bytes;
}
