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
