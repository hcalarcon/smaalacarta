// Gestos de la demo: lo que hace una persona (mover el mouse, tocar, escribir tecla por tecla) y
// las esperas, siempre con un tope y un mensaje claro si algo no aparece.
export const ESPERA = 20_000;
// El seguimiento del cliente consulta cada 15 s (no usa Realtime): 20 s quedaría justo.
export const ESPERA_SEGUIMIENTO = 30_000;
// Los paneles del local y del repartidor se actualizan solos (Realtime o consulta periódica). Si el cambio de
// la otra pantalla no aparece en 20 s, el paso falla y deja evidencia en fallo/.
export const ESPERA_PANEL = 20_000;

// Quién anota los focos del video (lo conecta el recorrido): `(page, tipo, box, cuando)`.
let anotarFoco = null;
export const conectarFocos = (fn) => {
  anotarFoco = fn;
};

export const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const pausa = (min = 1000, max = 1800) => dormir(min + Math.random() * (max - min));

export const escapar = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Espera a que el elemento deje de moverse (una hoja o un diálogo que termina de abrirse).
export async function esperarQuieto(locator, espera = ESPERA) {
  const limite = Date.now() + espera;
  let anterior = null;
  let iguales = 0;
  while (Date.now() < limite) {
    const box = await locator.first().boundingBox();
    const clave = box ? [box.x, box.y, box.width, box.height].map((n) => Math.round(n)).join(",") : null;
    iguales = clave !== null && clave === anterior ? iguales + 1 : 0;
    if (iguales >= 2) return;
    anterior = clave;
    await dormir(120);
  }
  throw new Error("La hoja o el diálogo no terminó de abrirse.");
}

// Espera a que el botón esté habilitado (visible no alcanza: puede estar esperando a la base).
async function esperarHabilitado(locator, espera) {
  const limite = Date.now() + espera;
  while (!(await locator.isEnabled())) {
    if (Date.now() > limite) throw new Error("El botón está a la vista pero sigue deshabilitado.");
    await dormir(150);
  }
}

// Lleva el puntero hasta el elemento y lo toca: lo espera visible, scrollea hasta él, lo espera quieto y
// habilitado, y recién ahí lo mueve y lo toca.
export async function tocar(page, locator, espera = ESPERA) {
  await locator.waitFor({ state: "visible", timeout: espera });
  await locator.scrollIntoViewIfNeeded({ timeout: ESPERA });
  await esperarQuieto(locator, ESPERA);
  await esperarHabilitado(locator, espera);
  const box = await locator.boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 25 });
  await dormir(250);
  anotarFoco?.(page, "toque", box);
  await locator.click({ delay: 90, timeout: ESPERA });
}

// Toca el campo y escribe tecla por tecla.
export async function escribir(page, locator, texto) {
  await tocar(page, locator);
  await locator.pressSequentially(texto, { delay: 70 });
  await pausa(500, 900);
}

// Elige una opción de un <select> mirándolo primero.
export async function elegir(page, select, value) {
  await tocar(page, select);
  await select.selectOption(value, { timeout: ESPERA });
  await pausa(500, 900);
}

export async function esperar(locator, timeout = ESPERA) {
  await locator.first().waitFor({ state: "visible", timeout });
}

// Espera a que aparezca y anota dónde quedó: es lo que la edición va a acercar. Si no termina de
// acomodarse, se anota donde esté.
export async function mostrar(page, locator, timeout = ESPERA) {
  await esperar(locator, timeout);
  const cuando = Date.now();
  await esperarQuieto(locator, ESPERA).catch(() => {});
  anotarFoco?.(page, "resultado", await locator.first().boundingBox(), cuando);
}

// Un diálogo o una hoja: visible y con la animación de apertura terminada.
export async function esperarDialogo(locator, espera = ESPERA) {
  await esperar(locator, espera);
  await esperarQuieto(locator, ESPERA);
}

export async function esperarOculto(locator, timeout = ESPERA) {
  await locator.first().waitFor({ state: "hidden", timeout });
}

// El texto del seguimiento (título del estado, "Buscando repartidor"…) que aparece solo.
export const verTexto = (page, texto) =>
  mostrar(page, page.getByText(texto, typeof texto === "string" ? { exact: true } : undefined), ESPERA_SEGUIMIENTO);
