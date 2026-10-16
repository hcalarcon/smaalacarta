// Tema claro/oscuro del menú (PUBLICO-16 y 24): el negocio deja uno por defecto en
// Configuración (`config.tema`) y el visitante puede cambiarlo con el switch; lo que elige
// queda en su navegador, por negocio, y gana al del negocio.

const THEMES = ["claro", "oscuro"];
const PREFIX = "sma-tema:";

const isTheme = (value) => THEMES.includes(value);

export function resolveTheme(config, storage, slug) {
  try {
    const saved = storage?.getItem(PREFIX + slug);
    if (isTheme(saved)) return saved;
  } catch {
    // Sin almacenamiento (modo privado): vale el tema del negocio.
  }

  return isTheme(config?.tema) ? config.tema : "claro";
}

export function rememberTheme(storage, slug, tema) {
  try {
    if (isTheme(tema)) storage.setItem(PREFIX + slug, tema);
  } catch {
    // ver arriba
  }
}

// El loader se pinta antes de conocer el tema del negocio (llega con la configuración). Por eso
// se recuerda el último tema que tuvo este menú y se aplica al abrir; la primera vez, claro.
const LOADER_PREFIX = "sma-tema-loader:";

export function loaderThemeKey(hostname, pathname, search) {
  const params = new URLSearchParams(search || "");
  const demo = params.get("demo") || params.get("cliente") || "";
  const segment = String(pathname || "").split("/")[1] || "";
  return `${hostname}|${segment}|${demo}`;
}

export function savedLoaderTheme(storage, key) {
  try {
    const saved = storage?.getItem(LOADER_PREFIX + key);
    return isTheme(saved) ? saved : null;
  } catch {
    return null;
  }
}

export function rememberLoaderTheme(storage, key, tema) {
  try {
    if (isTheme(tema)) storage.setItem(LOADER_PREFIX + key, tema);
  } catch {
    // Sin almacenamiento: el loader arranca claro.
  }
}
