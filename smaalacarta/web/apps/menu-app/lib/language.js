// Idioma del menú interactivo (PUBLICO-88 a 90). El idioma del celular no cambia el menú solo:
// se sugiere con un aviso, y lo que el visitante elige (o descarta) queda guardado.

const KEY = "sma-idioma";
const SUGGESTED = ["en", "pt"];

const base = (value) =>
  String(value ?? "")
    .toLowerCase()
    .split(/[-_]/)[0];

// Idioma guardado, solo si el menú lo ofrece. Sin almacenamiento (modo privado), no hay nada.
export function readSavedLang(storage, menuLangs) {
  try {
    const saved = storage?.getItem(KEY);
    return menuLangs.includes(saved) ? saved : null;
  } catch {
    return null;
  }
}

export function rememberLang(storage, lang) {
  try {
    if (["es", "en", "pt"].includes(lang)) storage.setItem(KEY, lang);
  } catch {
    // Sin almacenamiento: el aviso puede volver a aparecer.
  }
}

// Qué idioma ofrecerle al visitante, o null si no hay nada que ofrecer.
export function suggestLanguage(navigatorLang, menuLangs, saved) {
  if (["es", "en", "pt"].includes(saved)) return null;
  const lang = base(navigatorLang);
  return SUGGESTED.includes(lang) && menuLangs.includes(lang) ? lang : null;
}
