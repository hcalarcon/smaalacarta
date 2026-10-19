let cart = [];
let MENU_GLOBAL = null;

// Vista previa dentro del panel (PUBLICO-58 a 61): la misma app, sin Supabase, sin pedidos, sin
// localStorage y sin acciones; dibuja lo que le manda el panel. Es lo mismo que `isPreviewMode` de
// lib/preview.js, pero acá hace falta antes de cargar los módulos.
const PREVIEW = new URLSearchParams(window.location.search).get("preview") === "1";

// Módulos de /lib, cargados en init(): escape de HTML y datos del negocio.
let HTML = null;
let INFO = null;
let ORDERS = null;
let SCHEDULE = null;
let PWA = null;
let MENU = null;
let COLORS = null;
let I18N = null;
let PRICE = null;
let WA_WINDOW = null;
let CHECKOUT = null;
let THEME = null;
let STOCK = null;
let PREORDERS = null;
let MERCADOPAGO = null;
let OPTIONS = null;
let OPTIONS_SHEET = null;
let CART_LINES = null;
let NOTES = null;
let PROMO_INFO;
let LANGUAGE = null;
let LOOK = null;
// Envío con repartidor (ENVIO-20): los barrios del negocio, o null si no tiene o falló.
let DZ = null;
// Aviso de "puede que no haya repartidores" (ENVIO-198).
let AVAILABILITY = null;
let checkZoneCouriers = null;
let COURIER_ZONES = null;
// Zona del cliente al entrar (PUBLICO-73 a 78): `ZONE_ON` es si el local la pregunta; `ZONE_STEP` es
// qué muestra la tarjeta (ask, zones, notListed, confirmed o null si está cerrada).
let ZONE = null;
let ZONE_ON = false;
let ZONE_CHOICE = null;
let ZONE_STEP = null;
let ZONE_PICKUP = true;
let ZONE_QUERY = "";
// Quién tenía el foco al abrirse el diálogo de la zona: vuelve ahí al cerrarlo (PUBLICO-81).
let ZONE_RETURN_FOCUS = null;

// Idioma de la interfaz (IDIOMA-1 a 4) y el menú tal como vino, sin las secciones armadas.
let LANG = "es";
let SAVED_LANG = null;
let CART_COUNT = 0;
let BASE_MENU = null;
let LAST_THANKS = null;
let syncTema = () => {};
let HEADER_LAYOUT_READY = false;
let CART_STORAGE = null;
let CART_SLUG = null;

// Texto de la interfaz en el idioma elegido. Solo el mensaje de WhatsApp al negocio
// no pasa por acá: queda siempre en español (IDIOMA-5).
function tr(key, vars) {
  return I18N ? I18N.t(key, LANG, vars) : key;
}

// De dónde vino el menú: si es de Supabase, el pedido también se guarda en el sistema.
let MENU_SOURCE = null;
let SUPABASE_CFG = null;

async function fetchJSON(path) {
  try {
    const res = await fetch(path);

    if (!res.ok) {
      console.error(`HTTP ${res.status} → ${path}`);
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error("Fetch error:", path, err);
    return null;
  }
}

// El loader de la próxima visita se pinta con el tema que se ve ahora, sea el del negocio o el que
// eligió el visitante con el switch (PUBLICO-85).
function rememberLoaderTheme() {
  THEME.rememberLoaderTheme(
    window.localStorage,
    THEME.loaderThemeKey(location.hostname, location.pathname, location.search),
    document.documentElement.dataset.tema,
  );
}

// Termina la carga con un fade (PUBLICO-85): el menú entra (`entrando`) mientras el loader se
// desvanece y recién después se saca de la página. Si no hay transición (movimiento reducido)
// se saca enseguida.
function finishLoading() {
  const loader = document.getElementById("loader");
  document.body.classList.add("entrando");
  document.body.classList.remove("loading");
  if (!loader) return;

  const remove = () => loader.remove();
  const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (calm) {
    remove();
    return;
  }
  loader.classList.add("loader-saliendo");
  loader.addEventListener("transitionend", remove, { once: true });
  setTimeout(remove, 800);
  setTimeout(() => document.body.classList.remove("entrando"), 1000);
}

// Sin negocio (ni en Supabase ni en los JSON): antes se quedaba trabado en el
// loader para siempre. Sin plantilla ni marca (no hay negocio del que sacarlas):
// una pantalla simple, igual de espíritu que la del estático y el PDF.
function showNotFound() {
  document.body.classList.remove("loading");
  document.body.innerHTML = `
    <div style="display:flex;min-height:100vh;flex-direction:column;align-items:center;
      justify-content:center;gap:.5rem;padding:2rem;text-align:center;
      font-family:system-ui,-apple-system,sans-serif;color:#111827;">
      <h1 style="font-size:1.4rem;margin:0;">${tr("error.notFoundTitle")}</h1>
      <p style="margin:0;color:#6b7280;">${tr("error.notFoundText")}</p>
    </div>
  `;
}

// Qué negocio abre esta URL (RUTAS-1 y 2).
function resolveAppConfig(resolveHost, resolveDemo) {
  const params = new URLSearchParams(window.location.search);
  const host = window.location.hostname;

  /*
  ========================================
  1. PRIORIDAD: QUERY (DEV)
  ========================================
  Ej:
  ?demo=moderno
  ?cliente=don-juan
  */
  if (params.get("demo")) {
    return {
      slug: params.get("demo"),
      type: "demo",
    };
  }

  if (params.get("cliente")) {
    return {
      slug: params.get("cliente"),
      type: "cliente",
    };
  }

  /*
  ========================================
  2. PRODUCCIÓN: SUBDOMINIO = SLUG DEL NEGOCIO
  ========================================
  <slug>.smaalacarta.com.ar abre el negocio con ese slug, sin declararlo acá.
  Las reglas están en lib/hostname.js (con tests).
  */
  const fromHost = resolveHost ? resolveHost(host) : null;

  if (fromHost) {
    return fromHost;
  }

  /*
  ========================================
  3. DEMO POR PATH
  ========================================
  /moderno, /clasico y /minimal (también demo.smaalacarta.com.ar/moderno) abren la
  demo que nombran, con las mismas plantillas que un negocio real.
  */
  const fromPath = resolveDemo ? resolveDemo(window.location.pathname) : null;

  if (fromPath) {
    return fromPath;
  }

  /*
  ========================================
  4. FALLBACK (MVP)
  ========================================
  */
  console.warn("Dominio no reconocido:", host, "→ fallback a demo moderno");

  return {
    slug: "moderno",
    type: "demo",
  };
}

// Menú publicado desde el admin (PUBLICO-6). Devuelve null si Supabase no está
// configurado, el negocio no está publicado o algo falla: entonces se usan los JSON.
async function loadFromSupabase(slug) {
  try {
    const [{ fetchPublicMenu, isSupabaseConfigured }, { SUPABASE }] =
      await Promise.all([
        import("/apps/menu-app/lib/public-menu.js"),
        import("/apps/menu-app/supabase-config.js"),
      ]);

    if (!isSupabaseConfigured(SUPABASE)) return null;

    return await fetchPublicMenu({ ...SUPABASE, slug });
  } catch (err) {
    console.error("No se pudo cargar el menú desde Supabase:", err);
    return null;
  }
}

// INIT
async function init() {
  try {
    const [
      { resolveBusinessFromHost, resolveDemoFromPath },
      html,
      info,
      orders,
      supabaseConfig,
      schedule,
      pwa,
      menuLib,
      colorsLib,
      i18nLib,
      priceLib,
      waWindow,
      checkoutLib,
      themeLib,
      stockLib,
      preordersLib,
      mercadopagoLib,
      optionsLib,
      optionsSheetLib,
      cartLinesLib,
      deliveryZonesLib,
      cartStorageLib,
      loaderLib,
    ] = await Promise.all([
      import("/apps/menu-app/lib/hostname.js"),
      import("/apps/menu-app/lib/html.js"),
      import("/apps/menu-app/lib/info.js"),
      import("/apps/menu-app/lib/orders.js"),
      import("/apps/menu-app/supabase-config.js"),
      import("/apps/menu-app/lib/schedule.js"),
      import("/apps/menu-app/lib/pwa.js"),
      import("/apps/menu-app/lib/menu.js"),
      import("/apps/menu-app/lib/colors.js"),
      import("/apps/menu-app/lib/i18n.js"),
      import("/apps/menu-app/lib/price.js"),
      import("/apps/menu-app/lib/whatsapp-window.js"),
      import("/apps/menu-app/lib/checkout-options.js"),
      import("/apps/menu-app/lib/theme.js"),
      import("/apps/menu-app/lib/stock.js"),
      import("/apps/menu-app/lib/preorders.js"),
      import("/apps/menu-app/lib/mercadopago.js"),
      import("/apps/menu-app/lib/options.js"),
      import("/apps/menu-app/lib/options-sheet.js"),
      import("/apps/menu-app/lib/cart-lines.js"),
      import("/apps/menu-app/lib/delivery-zones.js"),
      import("/apps/menu-app/lib/cart-storage.js"),
      import("/apps/menu-app/lib/loader.js"),
    ]);
    LOOK = await import("/apps/menu-app/lib/menu-look.js");
    // Nota por producto (PUBLICO-65): la limpieza y las reglas puras viven en lib/item-notes.js.
    NOTES = await import("/apps/menu-app/lib/item-notes.js");
    // Vigencia y últimas unidades de las promociones (PUBLICO-68 y 69).
    PROMO_INFO = await import("/apps/menu-app/lib/promo-info.js");
    // Idioma elegido y sugerencia según el celular (PUBLICO-88 a 90).
    LANGUAGE = await import("/apps/menu-app/lib/language.js");
    ZONE = await import("/apps/menu-app/lib/zone-choice.js");
    // Aviso de "puede que no haya repartidores" en el checkout (ENVIO-198).
    AVAILABILITY = await import("/apps/menu-app/lib/courier-availability.js");
    checkZoneCouriers = AVAILABILITY.createZoneChecker((zoneId) =>
      AVAILABILITY.fetchZoneHasCouriers({ ...SUPABASE_CFG, zoneId }),
    );
    DZ = deliveryZonesLib;
    OPTIONS = optionsLib;
    OPTIONS_SHEET = optionsSheetLib;
    CART_LINES = cartLinesLib;
    CART_STORAGE = cartStorageLib;
    PRICE = priceLib;
    WA_WINDOW = waWindow;
    CHECKOUT = checkoutLib;
    THEME = themeLib;
    STOCK = stockLib;
    PREORDERS = preordersLib;
    MERCADOPAGO = mercadopagoLib;
    COLORS = colorsLib;
    I18N = i18nLib;
    // El idioma del celular ya no cambia el menú solo: se sugiere (PUBLICO-89 y 90). Vale ?lang=, lo que
    // el visitante eligió la última vez o el español.
    SAVED_LANG = PREVIEW ? null : LANGUAGE.readSavedLang(window.localStorage, I18N.LANGS);
    LANG = I18N.resolveLang({
      search: window.location.search,
      navigatorLanguage: SAVED_LANG ?? "",
    });
    SCHEDULE = schedule;
    PWA = pwa;
    MENU = menuLib;
    HTML = html;
    INFO = info;
    ORDERS = orders;
    SUPABASE_CFG = supabaseConfig.SUPABASE;

    if (PREVIEW) {
      await startPreview();
      return;
    }

    const result = resolveAppConfig(resolveBusinessFromHost, resolveDemoFromPath);
    if (!result) {
      console.error("No se encontró slug en la URL");
      return;
    }

    const { slug, type } = result;
    CART_SLUG = slug;

    const basePath = type === "cliente" ? "/data/clientes" : "/data/demos";

    // Los negocios que cargaron su menú en el admin vienen de Supabase; los demás
    // (y las demos) siguen en los JSON de /data.
    let config = null;
    let menu = null;

    if (type === "cliente") {
      const remote = await loadFromSupabase(slug);
      if (remote) {
        config = remote.config;
        menu = remote.menu;
        MENU_SOURCE = { slug };
      }
    }

    if (!config || !menu) {
      config = await fetchJSON(`${basePath}/${slug}/config.json`);
      if (!config) {
        showNotFound();
        return;
      }

      menu = await fetchJSON(`${basePath}/${slug}/menu.json`);
      if (!menu) {
        showNotFound();
        return;
      }
    }

    const loaderNegocio = document.querySelector("#loader-negocio");
    if (loaderNegocio) {
      loaderNegocio.textContent = config.nombre || "";
      loaderNegocio.hidden = !config.nombre;
    }
    loaderLib.applyLoaderAnimation(config);
    // Cómo se anima el menú y su imagen de fondo, según lo que eligió el negocio (PUBLICO-102 a 107).
    LOOK.applyMenuLook(document, config);

    window.CONFIG = config;
    // Barrios del envío con repartidor: solo los negocios de Supabase pueden tenerlo. Si falla,
    // el checkout queda como siempre.
    if (MENU_SOURCE) {
      COURIER_ZONES = await DZ.fetchDeliveryZones({ ...SUPABASE_CFG, slug: MENU_SOURCE.slug });
    }
    applyCheckoutOptions(config);
    initCourierFields();
    initZoneChoice(config, slug);
    renderScheduleChoice();
    renderDeliveryNotice();
    renderTransferInfo();
    document.documentElement.dataset.template = config.template || "";
    // El tema por defecto es el del negocio; si el visitante eligió otro, vale el suyo (PUBLICO-24).
    document.documentElement.dataset.tema = THEME.resolveTheme(config, window.localStorage, slug);
    rememberLoaderTheme();

    // App instalable: manifest, ícono y color del negocio (PWA-1 a 3).
    PWA.applyPwa(document, { type, slug, config });
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    // Lo que es solo de las demos: la propuesta de venta y el botón "Volver".
    const demo = INFO.isDemoMenu(type);
    const cta = document.querySelector(".cta-section");
    if (cta) cta.hidden = !demo;
    const volver = document.querySelector(".btn-volver");
    if (volver) volver.hidden = !demo;

    // Switch de tema: el visitante puede cambiar el tema que dejó el negocio (PUBLICO-24).
    const btnTema = document.getElementById("btn-tema");
    if (btnTema) {
      btnTema.hidden = false;
      // Sol (pasar a claro) y luna (pasar a oscuro): el ícono muestra el
      // tema al que se pasaría al tocar, no el actual.
      const SOL =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
      const LUNA =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>';

      syncTema = () => {
        const oscuro = document.documentElement.dataset.tema === "oscuro";
        btnTema.innerHTML = oscuro ? SOL : LUNA;
        btnTema.setAttribute("aria-label", tr(oscuro ? "theme.toLight" : "theme.toDark"));
      };
      syncTema();
      btnTema.addEventListener("click", () => {
        const next = document.documentElement.dataset.tema === "oscuro" ? "claro" : "oscuro";
        document.documentElement.dataset.tema = next;
        THEME.rememberTheme(window.localStorage, slug, next);
        rememberLoaderTheme();
        syncTema();
      });
    }

    // 🎨 Colores dinámicos
    // (con el texto que se lee sobre ellos: un negocio puede elegir colores claros)
    const brandVars = COLORS.brandVariables(config.colores);
    for (const [name, value] of Object.entries(brandVars)) {
      if (value) document.documentElement.style.setProperty(name, value);
    }

    // ⏳ Esperar que cargue el CSS del template
    await loadTemplate(config.template);
    configureModernHeader();

    if (!menu) {
      console.error("No se pudo cargar menú");
      document.body.innerHTML = `<h2>${tr("error.menu")}</h2>`;
      return;
    }

    BASE_MENU = menu;
    const enhancedMenu = MENU.buildEnhancedMenu(menu, LANG);

    MENU_GLOBAL = enhancedMenu;
    renderMenu(enhancedMenu);

    buildLangSelector();
    applyStaticTexts();
    renderHeader(config);
    renderCategorias(enhancedMenu);

    //renderMenu(menu);
    initSearch();
    loadCart();
    dropSoldOutFromCart(enhancedMenu);
    restoreThanks();

    finishLoading();
    maybeSuggestLanguage();
  } catch (err) {
    console.error("Error en init:", err);
    document.body.innerHTML = `<h2>${I18N ? tr("error.unexpected") : "Error inesperado"}</h2>`;
  }
}

// IDIOMA-4: selector ES/EN/PT. Cambiar de idioma vuelve a dibujar sin recargar la página.
function buildLangSelector() {
  const box = document.getElementById("selector-idioma");
  if (!box) return;

  // Botón compacto "ES" que abre la lista (solo lo muestra la cara de app; en Clásica siguen los tres botones).
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "idioma-toggle";
  toggle.setAttribute("aria-haspopup", "true");
  toggle.setAttribute("aria-expanded", "false");
  const setOpen = (open) => {
    box.classList.toggle("abierto", open);
    toggle.setAttribute("aria-expanded", String(open));
  };
  toggle.addEventListener("click", () => setOpen(!box.classList.contains("abierto")));
  box.appendChild(toggle);

  const lista = document.createElement("div");
  lista.className = "idioma-lista";
  box.appendChild(lista);

  I18N.LANGS.forEach((lang) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "idioma-opcion";
    b.textContent = lang.toUpperCase();
    b.dataset.lang = lang;
    b.addEventListener("click", () => {
      const abierta = box.classList.contains("abierto");
      setOpen(false);
      setLang(lang);
      if (abierta && getComputedStyle(toggle).display !== "none") toggle.focus();
    });
    lista.appendChild(b);
  });

  document.addEventListener("click", (e) => {
    if (!box.contains(e.target)) setOpen(false);
  });
  box.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !box.classList.contains("abierto")) return;
    e.stopPropagation();
    setOpen(false);
    toggle.focus();
  });
}

// Los textos fijos de index.html llevan data-i18n (texto) o data-i18n-placeholder.
function applyStaticTexts() {
  document.documentElement.lang = LANG;

  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = tr(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.placeholder = tr(node.dataset.i18nPlaceholder);
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((node) => {
    node.setAttribute("aria-label", tr(node.dataset.i18nAriaLabel));
  });

  const box = document.getElementById("selector-idioma");
  if (box) {
    box.setAttribute("aria-label", tr("lang.label"));
    box.querySelectorAll("button[data-lang]").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.lang === LANG));
    });
    const toggle = box.querySelector(".idioma-toggle");
    if (toggle) {
      toggle.textContent = LANG.toUpperCase();
      toggle.setAttribute("aria-label", `${tr("lang.label")}: ${LANG.toUpperCase()}`);
    }
  }

  syncTema();
  renderDeliveryNotice();
  renderTransferInfo();
  renderCourierFields();
  renderZone();
  syncBarraCarrito(CART_COUNT);
}

function setLang(lang) {
  if (lang === LANG || !I18N.LANGS.includes(lang)) return;
  LANG = lang;
  if (!PREVIEW) {
    LANGUAGE.rememberLang(window.localStorage, lang);
    SAVED_LANG = lang;
  }
  closeLangNotice();

  const url = new URL(window.location.href);
  url.searchParams.set("lang", lang);
  history.replaceState(null, "", url);

  applyStaticTexts();

  MENU_GLOBAL = MENU.buildEnhancedMenu(BASE_MENU, LANG);
  renderCategorias(MENU_GLOBAL);
  renderHeader(window.CONFIG);

  // Si hay algo escrito en el buscador, el filtro se vuelve a aplicar con los nombres nuevos.
  const buscador = document.querySelector("#buscador");
  if (buscador?.value) buscador.dispatchEvent(new Event("input"));
  else renderMenu(MENU_GLOBAL);

  if (LAST_THANKS && document.querySelector("#gracias-pedido")) showThanks(LAST_THANKS);
}

// Las hojas de la plantilla llevan `data-menu-template`: al cambiar de plantilla (vista previa) se
// reemplazan por las nuevas en cuanto cargan, sin que la página se quede un momento sin estilo.
const APP_SHELL_TEMPLATES = ["moderno", "minimal"];

function loadTemplate(template) {
  return new Promise((resolve, reject) => {
    if (!template) {
      console.warn("No se especificó template");
      resolve();
      return;
    }

    const previous = [...document.querySelectorAll("link[data-menu-template]")];
    if (previous.length > 0 && previous.every((link) => link.dataset.menuTemplate === template)) {
      resolve();
      return;
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `/templates/carrito/${template}/styles.css`;
    link.dataset.menuTemplate = template;

    // La cara de app (barra de abajo, hoja de checkout, pastilla de precio) es solo de Moderna y
    // Minimalista, y va al final para ganarle a las demás hojas (PUBLICO-86 a 97).
    const addShell = () => {
      if (!APP_SHELL_TEMPLATES.includes(template)) {
        previous.forEach((old) => old.remove());
        resolve();
        return;
      }
      const shell = document.createElement("link");
      shell.rel = "stylesheet";
      shell.href = "/apps/menu-app/cara-de-app.css";
      shell.dataset.menuTemplate = template;
      shell.onload = shell.onerror = () => {
        previous.forEach((old) => old.remove());
        resolve();
      };
      document.head.appendChild(shell);
    };

    // Después de la plantilla, y solo en pantallas anchas, el ajuste de escritorio
    // (PUBLICO-14). Si no carga, el menú se ve como antes.
    const addDesktop = () => {
      const desktop = document.createElement("link");
      desktop.rel = "stylesheet";
      desktop.href = "/apps/menu-app/desktop.css";
      desktop.media = "(min-width: 1024px)";
      desktop.dataset.menuTemplate = template;
      desktop.onload = desktop.onerror = addShell;
      document.head.appendChild(desktop);
    };

    link.onload = addDesktop;

    link.onerror = () => {
      console.error("Error cargando template:", template);
      addDesktop(); // 👈 no rompemos la app
    };

    document.head.appendChild(link);
  });
}

function configureModernHeader() {
  const header = document.querySelector(".header");
  if (!header) return;

  const compact = document.documentElement.dataset.template === "moderno" &&
    window.matchMedia("(max-width: 639px)").matches;
  const zoneChip = document.querySelector("#zona-chip");
  const search = document.querySelector("#buscador");

  if (compact) {
    if (zoneChip && zoneChip.parentElement !== document.querySelector("#linea-estado")) {
      document.querySelector("#linea-estado")?.append(zoneChip);
    }
    if (zoneChip) zoneChip.textContent = zoneChip.textContent.replace(/^📍\s*/, "");
  } else {
    if (zoneChip && zoneChip.parentElement !== header) header.insertBefore(zoneChip, search);
    if (zoneChip && !zoneChip.textContent.startsWith("📍 ")) zoneChip.textContent = `📍 ${zoneChip.textContent}`;
    document.body.classList.remove("header-scrolled", "buscador-abierto");
    document.querySelector("#btn-buscar")?.setAttribute("aria-expanded", "false");
  }

  if (!HEADER_LAYOUT_READY) {
    window.addEventListener("scroll", updateModernHeaderScrollState, { passive: true });
    window.addEventListener("resize", configureModernHeader);
    HEADER_LAYOUT_READY = true;
  }
  updateModernHeaderScrollState();
}

function updateModernHeaderScrollState() {
  const header = document.querySelector(".header");
  const stickyTitle = document.querySelector("#header-sticky-title");
  const compact = document.documentElement.dataset.template === "moderno" &&
    window.matchMedia("(max-width: 639px)").matches;
  const shouldShowCompact = Boolean(header && compact && window.scrollY >= header.offsetHeight);
  document.body.classList.toggle("header-scrolled", shouldShowCompact);
  if (stickyTitle) stickyTitle.toggleAttribute("hidden", !shouldShowCompact);
}

// RENDER
// Pedido anticipado (PUBLICO-33): con el negocio cerrado por horario (no por un cierre temporal)
// y el corte sin pasar, el menú toma el pedido para la próxima apertura. Null si no corresponde.
function currentPreorder(c, cierre = INFO?.closedNotice(c)) {
  if (!PREORDERS || !SCHEDULE || cierre || SCHEDULE.isOpenNow(c?.horarios)) return null;
  return PREORDERS.activePreorder(c);
}

function renderHeader(c) {
  const nombreEl = document.querySelector("#nombre-negocio");
  const miniNombreEl = document.querySelector("#nombre-negocio-mini");
  const descEl = document.querySelector("#descripcion-negocio");
  const estadoEl = document.querySelector("#estado-texto");
  const header = document.querySelector(".header");
  const dots = document.querySelectorAll(".badge-estado .dot, .linea-estado .dot");
  const lineaTexto = document.querySelector("#linea-estado-texto");

  if (nombreEl) nombreEl.textContent = c.nombre || "";
  if (miniNombreEl) miniNombreEl.textContent = c.nombre || "";

  // Logo del local junto al nombre (PUBLICO-97); lo muestran Moderna y Minimalista.
  const logoEl = document.querySelector("#logo-negocio");
  if (logoEl) {
    const logo = HTML.safeHttpUrl(c.logo);
    logoEl.onerror = () => logoEl.setAttribute("hidden", "");
    if (logo) {
      logoEl.src = logo;
      logoEl.removeAttribute("hidden");
    } else {
      logoEl.removeAttribute("src");
      logoEl.setAttribute("hidden", "");
    }
  }
  if (descEl) descEl.textContent = c.descripcion || "";

  if (header) {
    // Se asigna siempre (también vacío): en la vista previa la misma cabecera se vuelve a dibujar.
    header.style.backgroundImage = INFO.headerBackground(c, HTML.cssUrl) || "";
    header.style.backgroundPosition = INFO.headerPosition(c) || "";
  }

  const cierre = INFO.closedNotice(c);
  const fueraDeHorario = !cierre && !SCHEDULE.isOpenNow(c.horarios);
  const abierto = !cierre && !fueraDeHorario;

  renderInfo(c, cierre, fueraDeHorario, currentPreorder(c, cierre));

  const estado = tr(abierto ? "status.open" : "status.closed");
  if (estadoEl) estadoEl.textContent = estado;
  const zonaElegida = Boolean(ZONE_CHOICE);
  if (lineaTexto) {
    lineaTexto.textContent =
      document.documentElement.dataset.template === "moderno" &&
      window.matchMedia("(max-width: 639px)").matches &&
      zonaElegida
        ? estado
        : c.descripcion
          ? `${estado} · ${c.descripcion}`
          : estado;
  }

  dots.forEach((dot) => {
    dot.style.background = abierto ? "#4ade80" : "#ef4444";
  });
}

// El ícono de cada red: mismo trazo que usa el menú estático (lib/info.js).
function socialIcon(key) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", INFO.socialIconPath(key));
  svg.appendChild(path);
  return svg;
}

function externalLink(href) {
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}

// Aviso de cierre temporal (arriba, debajo del encabezado) y dirección y redes (al pie).
// Todo se arma con textContent y atributos: lo que escribe el negocio nunca se
// interpreta como HTML.
function renderInfo(c, cierre, fueraDeHorario = false, preorder = null) {
  document.querySelectorAll("#aviso-cierre, #pie-negocio").forEach((el) => el.remove());

  const header = document.querySelector(".header");
  if (!header) return;

  if (cierre) {
    const aviso = document.createElement("div");
    aviso.id = "aviso-cierre";
    aviso.className = "cierre-temporal";
    aviso.setAttribute("role", "status");
    aviso.textContent = [
      tr("closed.temporary"),
      cierre.message,
      INFO.reopenText(cierre.reopensOn, LANG),
    ]
      .filter(Boolean)
      .join(" · ");
    header.insertAdjacentElement("afterend", aviso);
  } else if (fueraDeHorario) {
    const aviso = document.createElement("div");
    aviso.id = "aviso-cierre";
    aviso.className = "cierre-temporal";
    aviso.setAttribute("role", "status");
    aviso.textContent = preorder
      ? PREORDERS.preorderNotice(preorder, LANG)
      : [tr("closed.now"), SCHEDULE.openingText(SCHEDULE.nextOpening(c.horarios), LANG)]
          .filter(Boolean)
          .join(" · ");
    header.insertAdjacentElement("afterend", aviso);
  }

  const links = INFO.socialLinks(c);
  const mapa = INFO.mapsUrl(c.direccion);
  const menu = document.querySelector("#menu");

  if (menu && (mapa || links.length > 0)) {
    const pie = document.createElement("footer");
    pie.id = "pie-negocio";
    pie.className = "pie-negocio";

    if (mapa) {
      const titulo = document.createElement("p");
      titulo.textContent = tr("footer.findUs");
      const a = externalLink(mapa);
      a.className = "direccion";
      a.textContent = "📍 " + c.direccion;
      pie.append(titulo, a);
    }

    if (links.length > 0) {
      const titulo = document.createElement("p");
      titulo.textContent = tr("footer.followUs");
      const redes = document.createElement("div");
      redes.className = "pie-redes";

      links.forEach((link) => {
        const a = externalLink(link.url);
        a.setAttribute("aria-label", link.name);
        a.title = link.name;
        a.appendChild(socialIcon(link.key));
        redes.appendChild(a);
      });

      pie.append(titulo, redes);
    }

    menu.insertAdjacentElement("afterend", pie);
  }

  // Cerrado: no se pueden enviar pedidos.
  const enviar = document.querySelector("#form-pedido button[type='submit']");
  if (enviar) {
    enviar.disabled = Boolean(cierre) || (fueraDeHorario && !preorder);
    if (cierre) enviar.textContent = tr("closed.temporary");
    else if (preorder) enviar.textContent = tr("preorder.submit");
    else if (fueraDeHorario) enviar.textContent = tr("closed.now");
  }
}

function renderCategorias(menu) {
  const categoriasContainer = document.getElementById("categorias");
  categoriasContainer.innerHTML = "";
  menu.categorias.forEach((cat) => {
    const b = document.createElement("button");
    b.textContent = cat.nombre;
    const id = cat.nombre.toLowerCase().replace(/\s+/g, "-");

    b.onclick = () =>
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    categoriasContainer.appendChild(b);
  });
}

function renderMenu(menu) {
  const menuContainer = document.getElementById("menu");
  menuContainer.innerHTML = "";

  menu.categorias.forEach((cat) => {
    const sec = document.createElement("div");
    sec.className = "categoria";

    sec.className = "categoria";

    if (cat.tipo) {
      sec.classList.add(`categoria-${cat.tipo}`);
    }

    const id = cat.nombre.toLowerCase().replace(/\s+/g, "-");
    sec.id = id;

    // 🔥 ESTRUCTURA CORRECTA
    sec.innerHTML = `
      <h2 class="categoria-titulo">${HTML.escapeHtml(cat.nombre)}</h2>
      <div class="categoria-grid"></div>
    `;

    const grid = sec.querySelector(".categoria-grid");

    (cat.items || []).forEach((p) => {
      const d = document.createElement("div");
      d.className = "producto";

      // Sin stock: se ve, atenuado y con su etiqueta, pero no se puede agregar (PUBLICO-26).
      const soldOut = STOCK.isSoldOut(p);
      if (soldOut) d.classList.add("agotado");

      if (p.promo) {
        d.setAttribute("data-promo", p.promo);
      }

      // Foto propia, ilustración de la base o logo (PUBLICO-54); las ilustraciones y el logo no se amplían.
      const imagen = INFO.productImage(p, window.CONFIG);
      const imagenClase = { illustration: "imagen-ilustrativa", logo: "imagen-logo" }[imagen?.kind];

      // Con las notas activas, tocar la foto o el nombre abre la hoja del producto (PUBLICO-65). El
      // nombre es un botón, para que también se llegue con el teclado.
      const abreHoja = !soldOut && notesOn();
      if (abreHoja) d.classList.add("abre-hoja");

      d.innerHTML = `
        ${imagen ? `<img${imagenClase ? ` class="${imagenClase}"` : ""} src="${HTML.escapeHtml(imagen.src)}" alt="">` : ""}
        <div class="producto-info">
          <h3>${abreHoja ? `<button type="button" class="producto-abrir">${HTML.escapeHtml(p.nombre)}</button>` : HTML.escapeHtml(p.nombre)}</h3>
          <p>${HTML.escapeHtml(p.descripcion || "")}</p>
          ${p.precioAnterior ? `<span class="precio-anterior">$${HTML.escapeHtml(PRICE.formatPrice(p.precioAnterior))}</span>` : ""}
          <div class="producto-precio">$${HTML.escapeHtml(PRICE.formatPrice(p.precio))}</div>
          ${imagen?.kind === "illustration" ? `<span class="etiqueta-ilustrativa">${HTML.escapeHtml(tr("item.illustrative"))}</span>` : ""}
          ${PROMO_INFO.validUntilLabel(p, LANG) ? `<span class="etiqueta-vigencia">${HTML.escapeHtml(PROMO_INFO.validUntilLabel(p, LANG))}</span>` : ""}
          ${PROMO_INFO.lastUnitsLabel(p, LANG) ? `<span class="etiqueta-quedan">${HTML.escapeHtml(PROMO_INFO.lastUnitsLabel(p, LANG))}</span>` : ""}
          ${soldOut ? `<span class="etiqueta-agotado">${HTML.escapeHtml(tr("item.soldOut"))}</span>` : ""}
        </div>
        ${soldOut ? "" : `<button class="btn-add">+</button>`}
      `;

      const btn = d.querySelector(".btn-add");

      // Animaciones de "agregado" del producto y del botón.
      const confirmAdded = () => {
        d.classList.add("adding");
        setTimeout(() => d.classList.remove("adding"), 350);

        btn.classList.add("added");
        btn.textContent = "✓";

        setTimeout(() => {
          btn.classList.remove("added");
          btn.textContent = "+";
        }, 600);
      };

      const openSheet = (returnFocus) =>
        openProductSheet(p, {
          imagen,
          returnFocus,
          onAdd: (chosen, note, quantity) => {
            addToCart(p, chosen, note, quantity);
            confirmAdded();
          },
        });

      if (btn) btn.onclick = () => {
        // Un producto con grupos de opciones abre la hoja para elegir (PUBLICO-45); uno sin grupos
        // se agrega directo, de un toque y sin nota, como siempre.
        if (OPTIONS.hasOptions(p)) {
          openSheet(btn);
          return;
        }

        addToCart(p);
        confirmAdded();
      };

      if (abreHoja) {
        const abrir = d.querySelector(".producto-abrir");
        abrir.addEventListener("click", () => openSheet(abrir));
        d.querySelector(":scope > img")?.addEventListener("click", () => openSheet(abrir));
      }

      grid.appendChild(d); // 👈 clave
    });

    menuContainer.appendChild(sec);
  });

  syncBarra();
}

function initSearch() {
  const input = document.querySelector("#buscador");
  const btnBuscar = document.querySelector("#btn-buscar");
  const menuContainer = document.querySelector("#menu");

  if (!input || !menuContainer) return;

  if (btnBuscar && document.documentElement.dataset.template === "moderno") {
    const setSearchOpen = (abierto, devolverFoco = true) => {
      document.body.classList.toggle("buscador-abierto", abierto);
      btnBuscar.setAttribute("aria-expanded", String(abierto));
      if (abierto) input.focus();
      else if (devolverFoco) btnBuscar.focus();
    };
    btnBuscar.addEventListener("click", () => {
      setSearchOpen(btnBuscar.getAttribute("aria-expanded") !== "true");
    });
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setSearchOpen(false);
    });
    document.addEventListener("click", (event) => {
      if (
        document.body.classList.contains("buscador-abierto") &&
        !input.contains(event.target) &&
        !btnBuscar.contains(event.target)
      ) {
        setSearchOpen(false, false);
      }
    });
  }

  input.addEventListener("input", (e) => {
    const term = (e.target.value || "").trim().toLowerCase();

    if (!MENU_GLOBAL?.categorias) return;

    if (!term) {
      renderMenu(MENU_GLOBAL);
      return;
    }

    const filtrado = {
      categorias: MENU_GLOBAL.categorias
        .map((cat) => {
          const catName = (cat.nombre || "").toLowerCase();
          const matchesCategory = catName.includes(term);

          const filteredItems = (cat.items || []).filter((p) => {
            const name = (p.nombre || "").toLowerCase();
            const desc = (p.descripcion || "").toLowerCase();
            return name.includes(term) || desc.includes(term);
          });

          return {
            ...cat,
            items: matchesCategory ? cat.items : filteredItems,
          };
        })
        .filter((cat) => {
          const catName = (cat.nombre || "").toLowerCase();
          const hasItems = (cat.items || []).length > 0;
          return catName.includes(term) || hasItems;
        }),
    };

    if (filtrado.categorias.length === 0) {
      menuContainer.innerHTML = `<div class="no-results"> <div class="no-results-icon">🔍</div>  ${tr("noResults")}</div>`;
    } else {
      renderMenu(filtrado);
    }
  });
}

// La hoja del producto (PUBLICO-45 y 65). Con las notas activas lleva foto, cantidad y nota; sin ellas es
// la hoja de opciones de siempre. `initial` y `confirmKey` la usan para editar una línea del carrito.
function openProductSheet(p, { imagen, returnFocus, onAdd, initial, confirmKey }) {
  OPTIONS_SHEET.openOptionsSheet({
    item: p,
    t: tr,
    formatPrice: PRICE.formatPrice,
    notesEnabled: notesOn(),
    image: imagen,
    returnFocus,
    initial,
    confirmKey,
    onAdd,
  });
}

// El producto del menú al que corresponde una línea del carrito (por id, o por nombre en los menús de
// JSON), para reabrir su hoja con las opciones vigentes. `null` si ya no está.
function menuProductFor(line) {
  for (const cat of MENU_GLOBAL?.categorias ?? []) {
    for (const p of cat.items || []) {
      if (line.id ? p.id === line.id : !p.id && p.nombre === line.nombre) return p;
    }
  }
  return null;
}

// Edita la línea `idx` del carrito en la hoja: opciones, cantidad y nota precargadas (PUBLICO-65).
function editCartLine(idx, opener) {
  const line = cart[idx];
  const product = line && menuProductFor(line);
  if (!product || STOCK.isSoldOut(product)) return;

  openProductSheet(product, {
    imagen: INFO.productImage(product, window.CONFIG),
    returnFocus: opener,
    confirmKey: "options.save",
    initial: { chosen: line.elegidas, quantity: line.cantidad, note: line.nota },
    onAdd: (chosen, note, quantity) => {
      cart = CART_LINES.replaceLine(cart, idx, product, chosen, note, quantity);
      saveCart();
      updateCart();
    },
  });
}

// CARRITO
// `chosen` son las opciones elegidas (PUBLICO-46): la misma elección suma cantidad y otra elección
// es otra línea; sin opciones se agrupa como siempre (por id, o por nombre en los menús de JSON).
function addToCart(p, chosen = [], note = "", quantity = 1) {
  if (!p) return;

  cart = CART_LINES.addLine(cart, p, chosen, note, quantity);

  saveCart();
  updateCart();
}

// ¿El negocio permite una nota por producto? (`config.notasPorItem`, PUBLICO-65)
function notesOn() {
  return Boolean(NOTES?.notesEnabled(window.CONFIG));
}

// El carrito que se manda: si el negocio desactivó las notas después de que el cliente las escribió,
// no viajan ni se listan en el mensaje.
function cartForOrder() {
  return notesOn() || !CART_LINES ? cart : CART_LINES.stripNotes(cart);
}

function updateCart() {
  const itemsContainer = document.querySelector("#carrito-items");
  const totalEl = document.querySelector("#carrito-total");
  const countEl = document.querySelector("#carrito-count");
  const btnCarrito = document.querySelector("#btn-carrito");

  if (!itemsContainer || !totalEl || !countEl) return;

  itemsContainer.innerHTML = "";

  let total = 0;
  let count = 0;

  cart.forEach((i, idx) => {
    total += i.precio * i.cantidad;
    count += i.cantidad;

    const d = document.createElement("div");
    d.className = "carrito-item";

    // Una línea con opciones muestra lo elegido y su subtotal con los extras (PUBLICO-46).
    const conOpciones = Array.isArray(i.elegidas) && i.elegidas.length > 0;
    const precioLinea = conOpciones ? CART_LINES.lineSubtotal(i) : i.precio;

    d.innerHTML = `
      <div class="item-info">
        <h4>${HTML.escapeHtml(i.nombre || "")}</h4>
        ${conOpciones ? `<ul class="item-opciones"></ul>` : ""}
        <span class="item-precio">$${HTML.escapeHtml(PRICE.formatPrice(precioLinea))}</span>
      </div>
      <div class="item-controls">
        <button class="btn-minus"><svg width="16" height="16" viewBox="0 0 24 24">
  <path d="M5 12h14" stroke="currentColor" stroke-width="2"/>
</svg></button>
        <span class="item-cantidad">${HTML.escapeHtml(i.cantidad)}</span>
        <button class="btn-plus">
        <svg width="16" height="16" viewBox="0 0 24 24">
          <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2"/>
        </svg>
        </button>
        <button class="btn-remove">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M3 6h18" stroke="currentColor" stroke-width="2"/>
            <path d="M8 6V4h8v2" stroke="currentColor" stroke-width="2"/>
            <path d="M6 6l1 14h10l1-14" stroke="currentColor" stroke-width="2"/>
          </svg>
        </button>
      </div>
    `;

    if (conOpciones) {
      const lista = d.querySelector(".item-opciones");
      for (const option of i.elegidas) {
        const li = document.createElement("li");
        li.textContent = option.cantidad > 1 ? `${option.nombre} ×${option.cantidad}` : option.nombre;
        lista.appendChild(li);
      }
    }

    // La nota del cliente, de solo lectura (PUBLICO-65): se escribe y se edita en la hoja del producto.
    // Todo con textContent: nunca HTML.
    if (notesOn()) {
      const nota = typeof i.nota === "string" ? NOTES.cleanNote(i.nota) : "";

      if (nota) {
        const p = document.createElement("p");
        p.className = "item-nota";
        p.textContent = `📝 ${nota}`;
        d.querySelector(".item-info")?.appendChild(p);
      }

      const producto = menuProductFor(i);
      if (producto && !STOCK.isSoldOut(producto)) {
        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "btn-nota";
        edit.setAttribute("aria-label", tr(nota ? "note.edit" : "note.add"));
        edit.title = tr(nota ? "note.edit" : "note.add");
        edit.innerHTML =
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
        edit.addEventListener("click", () => editCartLine(idx, edit));
        d.querySelector(".item-controls")?.prepend(edit);
      }
    }

    const btnMinus = d.querySelector(".btn-minus");
    const btnPlus = d.querySelector(".btn-plus");
    const btnRemove = d.querySelector(".btn-remove");

    btnMinus?.addEventListener("click", () => {
      if (i.cantidad > 1) {
        i.cantidad--;
      } else {
        cart.splice(idx, 1);
      }
      updateCart();
    });

    btnPlus?.addEventListener("click", () => {
      i.cantidad++;
      updateCart();
    });

    btnRemove?.addEventListener("click", () => {
      cart.splice(idx, 1);
      updateCart();
    });

    itemsContainer.appendChild(d);
  });

  totalEl.textContent = `$${total}`;
  countEl.textContent = count;
  const checkoutTotal = document.querySelector("#checkout-total");
  if (checkoutTotal) checkoutTotal.textContent = `$${total}`;
  CART_COUNT = count;
  syncBarraCarrito(count);

  // 🔥 IMPORTANTE: persistencia SIEMPRE actualizada
  saveCart();

  if (btnCarrito) {
    if (count > 0) {
      btnCarrito.classList.add("visible");
    } else {
      btnCarrito.classList.remove("visible");
    }
  }

  const btnFinalizar = document.querySelector("#btn-finalizar");
  if (btnFinalizar) {
    btnFinalizar.disabled = count === 0;
    btnFinalizar.style.opacity = count === 0 ? "0.5" : "1";
    btnFinalizar.style.pointerEvents = count === 0 ? "none" : "auto";
  }
}

// PERSISTENCIA
function saveCart() {
  if (PREVIEW) return; // la vista previa no toca el almacenamiento
  CART_STORAGE.saveCart(window.localStorage, CART_SLUG, cart);
}

// Quita del carrito lo que quedó sin stock (por ejemplo, un carrito guardado de otra visita) y
// avisa qué se quitó (PUBLICO-26). Solo con un menú de Supabase, donde los ítems tienen id.
function dropSoldOutFromCart(menu) {
  if (!MENU_SOURCE || !STOCK) return;

  const { cart: kept, removed } = STOCK.reconcileCart(cart, menu);
  if (removed.length === 0) return;

  cart = kept;
  saveCart();
  updateCart();
  alert(tr("cart.removedSoldOut", { names: removed.join(", ") }));
}

// Vuelve a pedir el menú al sistema y lo pinta de nuevo, por ejemplo cuando un pedido se
// rechazó por falta de stock. Si no se puede, queda el menú que ya estaba.
async function refreshMenu() {
  if (!MENU_SOURCE) return;

  const remote = await loadFromSupabase(MENU_SOURCE.slug);
  if (!remote?.menu) return;

  BASE_MENU = remote.menu;
  MENU_GLOBAL = MENU.buildEnhancedMenu(BASE_MENU, LANG);
  renderCategorias(MENU_GLOBAL);
  renderMenu(MENU_GLOBAL);
  dropSoldOutFromCart(MENU_GLOBAL);
}

function loadCart() {
  if (PREVIEW) return;
  cart = CART_STORAGE.loadCart(window.localStorage, CART_SLUG);
  updateCart();
}

// UI (más moderno + seguro)
const $ = (sel) => document.querySelector(sel);

// Quien abrió el carrito o el checkout: el foco vuelve ahí al cerrarlos (PUBLICO-95).
let LAYER_OPENER = null;
// Hay una entrada puesta en el historial mientras el carrito o el checkout están abiertos, para que el
// gesto de atrás del celular los cierre en vez de salir del menú (PUBLICO-95).
let LAYER_ENTRY = false;

function pushLayer() {
  if (PREVIEW || LAYER_ENTRY) return;
  try {
    history.pushState({ smaCapa: true }, "");
    LAYER_ENTRY = true;
  } catch {
    // Sin historial: se cierra con la X y con Escape.
  }
}

window.addEventListener("popstate", () => {
  if (!LAYER_ENTRY) return;
  LAYER_ENTRY = false;
  closeAll();
});

// Escape cierra el carrito y el checkout, salvo que haya arriba un diálogo con su propio Escape (la zona).
document.addEventListener("keydown", (e) => {
  // Un diálogo abierto arriba (zona, hoja de producto, foto ampliada) tiene su propio Escape: ese se cierra primero.
  if (e.key !== "Escape" || document.querySelector(".zona-dialogo, .opciones-hoja, .lightbox")) return;
  if ($("#checkout")?.classList.contains("active") || $("#carrito-panel")?.classList.contains("active")) {
    closeAll();
  }
});

// Se sale de la página con la entrada del carrito reemplazada y no sumada: al volver con "atrás" desde el
// seguimiento o desde el pago no queda una entrada de más del menú (PUBLICO-95).
function goTo(url) {
  if (LAYER_ENTRY) {
    LAYER_ENTRY = false;
    window.location.replace(url);
  } else {
    window.location.href = url;
  }
}

// Mientras el carrito o el checkout están abiertos, el resto de la página no recibe foco ni lectura
// (`inert`): el diálogo es modal de verdad y Tab no se escapa a lo de atrás.
const LAYER_IDS = ["carrito-panel", "checkout", "overlay", "loader", "aviso-idioma"];

function setBackgroundInert(on) {
  for (const node of document.body.children) {
    if (node.tagName === "SCRIPT" || LAYER_IDS.includes(node.id)) continue;
    node.inert = on;
  }
}

function openCart() {
  LAYER_OPENER = document.activeElement;
  pushLayer();
  setBackgroundInert(true);
  $("#carrito-panel")?.classList.add("active");
  $("#overlay")?.classList.add("active");
  document.body.classList.add("no-scroll");
  $("#carrito-panel")?.focus({ preventScroll: true });
}

function openCheckout() {
  LAYER_OPENER ??= document.activeElement;
  pushLayer();
  setBackgroundInert(true);
  $("#overlay")?.classList.add("active");
  $("#checkout")?.classList.add("active");
  document.body.classList.add("no-scroll");
  // El foco entra a la hoja sin abrir el teclado del celular.
  $("#checkout")?.focus({ preventScroll: true });
}

$("#btn-carrito")?.addEventListener("click", openCart);

$("#cerrar-carrito")?.addEventListener("click", closeAll);
$("#overlay")?.addEventListener("click", closeAll);

function closeAll() {
  // Cerrar el panel "Pedido registrado" lo da por visto: no vuelve a aparecer al recargar.
  if (document.querySelector("#gracias-pedido")) ORDERS?.forgetLastOrder(window.localStorage);
  resetCheckout();
  $("#carrito-panel")?.classList.remove("active");
  $("#overlay")?.classList.remove("active");
  $("#checkout")?.classList.remove("active");
  document.body.classList.remove("no-scroll");
  setBackgroundInert(false);

  if (LAYER_ENTRY) {
    LAYER_ENTRY = false;
    history.back();
  }
  if (LAYER_OPENER?.isConnected) LAYER_OPENER.focus?.({ preventScroll: true });
  LAYER_OPENER = null;
}

$("#btn-finalizar")?.addEventListener("click", () => {
  // Las horas disponibles dependen de la hora de ahora: se calculan al abrir el checkout.
  renderScheduleChoice();
  $("#carrito-panel")?.classList.remove("active");
  // El fondo sigue activo: tocar afuera del checkout lo cierra (closeAll).
  openCheckout();
});

$("#cerrar-checkout")?.addEventListener("click", closeAll);

// BARRA DE ABAJO (PUBLICO-92): Menú, Promos y Carrito. Solo la muestran Moderna y Minimalista.
const calmMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function scrollToSection(node) {
  node?.scrollIntoView({ behavior: calmMotion() ? "auto" : "smooth", block: "start" });
}

function syncBarra() {
  const promos = $("#barra-promos");
  if (promos) promos.hidden = !document.querySelector("#menu .categoria-ofertas");
  updateBarraActive();
}

function syncBarraCarrito(count) {
  const badge = $("#barra-carrito-count");
  if (badge) {
    badge.textContent = count;
    badge.hidden = count === 0;
  }
  $("#barra-carrito")?.setAttribute("aria-label", count > 0 ? `${tr("nav.cart")} (${count})` : tr("nav.cart"));
}

// Marca en la barra dónde está el visitante: en las promos o en el resto del menú.
function updateBarraActive() {
  // Las solapas de categorías quedaron fijas arriba: pasan por debajo del selector de idioma.
  const nav = document.querySelector("#categorias");
  document.body.classList.toggle("categorias-fijas", !!nav && nav.getBoundingClientRect().top <= 0.5);

  const promos = document.querySelector("#menu .categoria-ofertas");
  const rect = promos?.getBoundingClientRect();
  const middle = window.innerHeight * 0.4;
  const onPromos = !!rect && rect.top < middle && rect.bottom > middle;
  const set = (id, active) => {
    const node = $(id);
    if (!node) return;
    if (active) node.setAttribute("aria-current", "true");
    else node.removeAttribute("aria-current");
  };
  set("#barra-menu", !onPromos);
  set("#barra-promos", onPromos);
}

let BARRA_FRAME = 0;
const onScrollOrResize = () => {
  if (BARRA_FRAME) return;
  BARRA_FRAME = requestAnimationFrame(() => {
    BARRA_FRAME = 0;
    updateBarraActive();
  });
};
window.addEventListener("scroll", onScrollOrResize, { passive: true });
// Girar el celular o cambiar el tamaño reacomoda las solapas: se vuelve a calcular.
window.addEventListener("resize", onScrollOrResize);

$("#barra-menu")?.addEventListener("click", () => {
  scrollToSection(
    document.querySelector("#menu .categoria:not(.categoria-ofertas):not(.categoria-destacados)") ?? $("#menu"),
  );
});
$("#barra-promos")?.addEventListener("click", () => {
  scrollToSection(document.querySelector("#menu .categoria-ofertas"));
});
$("#barra-carrito")?.addEventListener("click", openCart);

// SUGERENCIA DE IDIOMA (PUBLICO-88 a 90): un aviso chico, que se cierra y no vuelve.
function closeLangNotice() {
  document.getElementById("aviso-idioma")?.remove();
}

function maybeSuggestLanguage() {
  if (PREVIEW || LANG !== I18N.DEFAULT_LANG || new URLSearchParams(window.location.search).has("lang")) return;
  const suggested = LANGUAGE.suggestLanguage(navigator.language, I18N.LANGS, SAVED_LANG);
  if (!suggested || document.getElementById("aviso-idioma")) return;

  // El aviso habla el idioma que se sugiere: es el que entiende quien lo tiene que leer.
  const box = document.createElement("div");
  box.id = "aviso-idioma";
  box.className = "aviso-idioma";
  box.setAttribute("role", "status");
  box.lang = suggested;

  const text = document.createElement("span");
  text.className = "aviso-idioma-texto";
  text.textContent = I18N.t("lang.suggest", suggested, { idioma: LANGUAGE.LANG_NAMES[suggested] });

  const yes = document.createElement("button");
  yes.type = "button";
  yes.className = "aviso-idioma-si";
  yes.textContent = I18N.t("lang.suggestYes", suggested);
  yes.addEventListener("click", () => setLang(suggested));

  const no = document.createElement("button");
  no.type = "button";
  no.className = "aviso-idioma-cerrar";
  no.textContent = "✕";
  no.setAttribute("aria-label", I18N.t("lang.suggestClose", suggested));
  no.addEventListener("click", () => {
    LANGUAGE.rememberLang(window.localStorage, LANG);
    SAVED_LANG = LANG;
    closeLangNotice();
  });

  box.append(text, yes, no);
  document.body.appendChild(box);
}

// WHATSAPP
$("#form-pedido")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  // La página puede haber quedado abierta desde antes de que el negocio cerrara.
  if (INFO?.closedNotice(window.CONFIG)) {
    alert(tr("error.closedTemporary"));
    return;
  }
  // Cerrado por horario: con pedidos anticipados activos el pedido es para la próxima apertura
  // (PUBLICO-33); si no, no se puede enviar.
  const preorder = currentPreorder(window.CONFIG);
  if (SCHEDULE && !preorder && !SCHEDULE.isOpenNow(window.CONFIG?.horarios)) {
    alert(
      [tr("error.closedNow"), SCHEDULE.openingText(SCHEDULE.nextOpening(window.CONFIG?.horarios), LANG)]
        .filter(Boolean)
        .join(" "),
    );
    return;
  }

  const form = e.target;
  const f = new FormData(form);

  // El teléfono del cliente es obligatorio en todos los pedidos (ENVIO-87): es cómo el local lo contacta.
  const phone = String(f.get("telefono") ?? "").trim();
  if (DZ && !DZ.isValidPhone(phone)) {
    alert(tr("error.invalidPhone"));
    return;
  }

  // El envío solo se confirma a una zona de la lista, y no con "Mi barrio no está" (PUBLICO-82).
  const deliveryProblem = DZ
    ? DZ.deliveryProblem({
        zones: COURIER_ZONES,
        delivery: f.get("entrega"),
        zoneId: f.get("barrio"),
        blocked: Boolean(ZONE_ON && ZONE?.deliveryBlocked(ZONE_CHOICE)),
      })
    : null;
  if (deliveryProblem) {
    alert(
      tr(
        deliveryProblem === "no_delivery"
          ? ZONE_PICKUP
            ? "zone.noDelivery"
            : "zone.noDeliveryOnly"
          : "error.invalidZone",
      ),
    );
    return;
  }

  // Envío con repartidor (ENVIO-21): barrio y dirección. Los campos ocultos van deshabilitados y no
  // entran en el FormData.
  const courier = DZ
    ? DZ.courierOrderFields({
        zones: COURIER_ZONES,
        delivery: f.get("entrega"),
        zoneId: f.get("barrio"),
        address: f.get("direccion"),
      })
    : {};
  const courierZone = courier.deliveryZone ? DZ.findZone(COURIER_ZONES, courier.deliveryZone) : null;

  // Con Mercado Pago el cliente sale a pagar y WhatsApp queda para después, desde el seguimiento
  // (PUBLICO-36): no se abre la ventana.
  const online = Boolean(MERCADOPAGO?.isMercadoPago(f.get("pago")));

  // En PC, la ventana de WhatsApp se abre ya, dentro del gesto del toque: después de un
  // await el navegador la bloquearía (SEGUIMIENTO-14).
  const placeholder = online ? null : (WA_WINDOW?.openPlaceholder(window) ?? null);

  let total = 0;

  let msg = `🍔 *Nuevo pedido*\n\n`;

  msg += `👤 Cliente: ${f.get("nombre")}\n`;
  msg += `📞 Teléfono: ${phone}\n`;
  msg += `🚚 Entrega: ${f.get("entrega")}\n`;
  // El precio del envío es de referencia y se paga al repartidor: no entra en el total (ENVIO-22).
  if (courierZone) {
    msg += DZ.courierWhatsappLines(courierZone, { address: courier.deliveryAddress }, PRICE.formatPrice);
  }

  const ahora = f.get("ahora");
  const horario = f.get("horario");

  // Menú de Supabase con horas para elegir: la hora va al servidor como `scheduledFor` y el
  // mensaje de WhatsApp la dice igual que siempre (PUBLICO-30).
  const hourSelect = document.querySelector('#horario-programado select[name="hora"]');
  const choosing =
    !preorder && CHECKOUT?.scheduleChoice(window.CONFIG, Boolean(MENU_SOURCE)).mode === "slots";
  const scheduledFor = choosing && f.get("cuando") === "schedule" ? f.get("hora") || null : null;

  if (preorder) {
    msg += `${PREORDERS.preorderMessageLine(preorder)}\n`;
  } else if (choosing) {
    msg += scheduledFor
      ? `⏰ Horario: ${hourSelect.selectedOptions[0].textContent}\n`
      : `⏰ Horario: Ahora mismo\n`;
  } else if (ahora) {
    msg += `⏰ Horario: Ahora mismo\n`;
  } else if (horario) {
    msg += `⏰ Horario: ${horario}\n`;
  }

  msg += `💳 Pago: ${online ? "Mercado Pago" : f.get("pago")}\n`;

  const notas = f.get("notas");
  if (notas) msg += `📝 Notas: ${notas}\n`;

  msg += `\n🧾 *Detalle del pedido:*\n\n`;

  // Cada ítem con sus opciones debajo; el precio por unidad y el subtotal ya incluyen los extras.
  const detail = CART_LINES.whatsappDetail(cartForOrder(), PRICE.formatPrice);
  msg += detail.text;
  total += detail.total;

  msg += `━━━━━━━━━━━━━━\n`;
  msg += `💰 *TOTAL: $${PRICE.formatPrice(total)}*\n\n`;
  msg += `📲 SMA a la Carta`;

  // Si el menú viene de Supabase, el pedido se guarda primero en el sistema para poder
  // seguirlo. Si no se puede (menú de JSON, sin conexión…), sigue por WhatsApp como siempre.
  const items = MENU_SOURCE && ORDERS ? ORDERS.buildOrderItems(cartForOrder()) : null;
  let saved = null;

  if (items) {
    const submit = form.querySelector("button[type='submit']");
    if (submit) {
      submit.disabled = true;
      submit.textContent = tr("checkout.sending");
    }

    // Solo el campo libre (menú sin horas para elegir) sigue yendo en las notas.
    const horarioNota = choosing || preorder ? "" : ahora ? "Horario: ahora mismo" : horario ? `Horario: ${horario}` : "";
    const result = await ORDERS.createOrder({
      ...SUPABASE_CFG,
      slug: MENU_SOURCE.slug,
      customer: f.get("nombre") || "",
      delivery: f.get("entrega") || "",
      payment: f.get("pago") || "",
      notes: [horarioNota, f.get("notas") || ""].filter(Boolean).join(" · ").slice(0, 500),
      items,
      scheduledFor,
      preorder: Boolean(preorder),
      // El teléfono va siempre; barrio y dirección, solo con envío (ENVIO-87).
      customerPhone: phone,
      ...courier,
    });

    if (submit) {
      submit.disabled = false;
      submit.textContent = preorder ? tr("preorder.submit") : tr("checkout.submit");
    }

    if (result.ok) {
      saved = result;
    } else if (result.reason === "closed") {
      WA_WINDOW?.discardPlaceholder(placeholder);
      alert(tr("error.closedTemporary"));
      return;
    } else if (result.reason === "outside_hours") {
      WA_WINDOW?.discardPlaceholder(placeholder);
      alert(tr("error.outsideHours"));
      return;
    } else if (result.reason === "busy") {
      WA_WINDOW?.discardPlaceholder(placeholder);
      alert(tr("error.busy"));
      return;
    } else if (result.reason === "out_of_stock") {
      WA_WINDOW?.discardPlaceholder(placeholder);
      alert(tr("error.outOfStock"));
      await refreshMenu();
      return;
    } else if (result.reason === "invalid_options") {
      // Las opciones cambiaron desde que se armó el carrito: se vuelve a pedir el menú y se limpia.
      WA_WINDOW?.discardPlaceholder(placeholder);
      alert(tr("error.invalidOptions"));
      await refreshMenu();
      return;
    } else if (result.reason === "invalid_delivery" || result.reason === "invalid_payment") {
      WA_WINDOW?.discardPlaceholder(placeholder);
      alert(tr("error.optionsChanged"));
      return;
    } else if (result.reason === "invalid_phone") {
      WA_WINDOW?.discardPlaceholder(placeholder);
      alert(tr("error.invalidPhone"));
      return;
    } else if (result.reason === "invalid_zone") {
      // El barrio se dio de baja o el negocio ya no tiene envío: se piden los barrios de nuevo.
      WA_WINDOW?.discardPlaceholder(placeholder);
      alert(tr("error.invalidZone"));
      COURIER_ZONES = await DZ.fetchDeliveryZones({ ...SUPABASE_CFG, slug: MENU_SOURCE.slug });
      renderCourierFields();
      return;
    } else if (result.reason === "scheduling_disabled") {
      WA_WINDOW?.discardPlaceholder(placeholder);
      alert(tr("error.schedulingDisabled"));
      await refreshMenu();
      return;
    } else if (result.reason === "invalid_schedule") {
      WA_WINDOW?.discardPlaceholder(placeholder);
      alert(tr("error.invalidSchedule"));
      renderScheduleChoice();
      return;
    } else if (result.reason === "preorder_closed") {
      // Pasó el corte (o el negocio cambió la configuración): se recarga para ver el estado de
      // ahora. El carrito queda guardado.
      WA_WINDOW?.discardPlaceholder(placeholder);
      alert(tr("error.preorderClosed"));
      window.location.reload();
      return;
    } else if (result.reason === "unavailable") {
      WA_WINDOW?.discardPlaceholder(placeholder);
      alert(tr("error.unavailable"));
      // Una promoción pudo vencer o agotarse: se vuelve a pedir el menú y se limpia el carrito (PUBLICO-71).
      await refreshMenu();
      return;
    }
    // "invalid" y "unknown": se manda solo por WhatsApp.
  }

  // Sin pedido guardado no hay nada que cobrar: Mercado Pago no tiene el respaldo de WhatsApp.
  if (online && !saved) {
    alert(tr("error.mpNotSaved"));
    return;
  }

  // Un pedido anticipado no tiene seguimiento (salvo que se pague con Mercado Pago: el pago vuelve
  // ahí, PUBLICO-38): ni link ni panel para volver a verlo.
  const link = saved && (!preorder || online) ? ORDERS.trackingLink(window.location.origin, saved.code, LANG) : "";
  if (saved) msg = ORDERS.finalizeOrderMessage(msg, { number: saved.number, link });

  const whatsappUrl = ORDERS
    ? ORDERS.whatsappOrderUrl(CONFIG.telefono, msg)
    : `https://api.whatsapp.com/send?phone=${CONFIG.telefono}&text=${encodeURIComponent(msg)}`;

  cart = [];
  saveCart();
  updateCart();

  if (saved && online) {
    // El mensaje queda guardado para enviarlo por WhatsApp desde el seguimiento (SEGUIMIENTO-10).
    ORDERS.rememberHandoff(window.localStorage, saved.code, whatsappUrl);
    await payOnline(form, saved.code, link);
    return;
  }

  if (saved && !preorder) {
    // Un pedido guardado va directo al seguimiento (SEGUIMIENTO-34): ahí se ve el estado, se elige el
    // repartidor y, si quiere, se manda también por WhatsApp (el link queda guardado, es opcional).
    ORDERS.rememberHandoff(window.localStorage, saved.code, whatsappUrl);
    WA_WINDOW?.discardPlaceholder(placeholder);
    goTo(link);
    return;
  }

  if (saved) {
    // Pedido anticipado (sin seguimiento): conserva el panel "Pedido registrado" y abre WhatsApp.
    showThanks({
      number: saved.number,
      code: saved.code,
      link,
      whatsappUrl,
      transfer: CHECKOUT?.transferDetails(CONFIG, f.get("pago")) ?? null,
      preorder,
    });
    // En PC, WhatsApp va a la ventana abierta al tocar; si no hubo, a la misma pestaña.
    openWhatsAppUrl(placeholder, whatsappUrl);
  } else {
    // Sin pedido guardado: en PC, la ventana ya abierta; si no, como siempre.
    if (placeholder) openWhatsAppUrl(placeholder, whatsappUrl);
    else window.open(whatsappUrl);
    closeAll();
  }
});

// Pedido con Mercado Pago ya guardado: pide el link de pago y redirige. El navegador solo manda el
// código del pedido (los montos los arma el servidor). Si no se puede, avisa y lleva al
// seguimiento, que ofrece reintentar y deja el pedido cancelable por el negocio (PUBLICO-36 y 37).
async function payOnline(form, code, trackingLink) {
  const submit = form.querySelector("button[type='submit']");
  if (submit) {
    submit.disabled = true;
    submit.textContent = tr("checkout.sending");
  }

  const pay = await MERCADOPAGO.createPayment({ code });
  if (pay.ok) {
    goTo(pay.url);
    return;
  }

  alert(tr("error.mpFailed"));
  goTo(trackingLink);
}

function openWhatsAppUrl(placeholder, url) {
  if (WA_WINDOW) return WA_WINDOW.openWhatsApp(placeholder, url, window);
  goTo(url);
  return "same-tab";
}

// "Pedido registrado": WhatsApp se abre solo al confirmar; este panel es lo que el cliente
// ve al volver. El botón principal lleva al seguimiento y, aparte, un link chico permite
// reenviar el mensaje si WhatsApp no se abrió (SEGUIMIENTO-10). Todo con textContent: el
// número y los links no se interpretan como HTML.
function showThanks(data) {
  const { number, code, link, whatsappUrl, transfer, preorder } = data;
  const form = $("#form-pedido");
  if (!form) return;

  LAST_THANKS = data;

  resetCheckout();
  form.classList.add("hidden");

  const panel = document.createElement("div");
  panel.id = "gracias-pedido";
  panel.className = "gracias-pedido";

  const title = document.createElement("h3");
  title.textContent = tr("thanks.title", { n: number });

  const info = document.createElement("p");
  info.className = "gracias-aviso";
  info.textContent = tr("thanks.pending");

  // Un pedido anticipado no tiene seguimiento: dice para qué día es y nada más (PUBLICO-33).
  const date = document.createElement("p");
  date.className = "gracias-aviso";
  date.textContent = preorder ? PREORDERS.preorderThanks(preorder, LANG) : "";

  const track = document.createElement("a");
  track.className = "btn-seguimiento destacado";
  // El link ya lleva ?lang= (IDIOMA-7 y 12).
  track.href = link;
  track.textContent = tr("thanks.track");

  const resend = document.createElement("a");
  resend.className = "gracias-reenviar";
  resend.href = whatsappUrl;
  resend.target = "_blank";
  resend.rel = "noopener noreferrer";
  resend.textContent = tr("thanks.resend");
  resend.addEventListener("click", () => {
    ORDERS?.markHandoffSent(window.localStorage, code);
  });

  const close = document.createElement("button");
  close.type = "button";
  close.textContent = tr("thanks.close");
  close.onclick = closeAll;

  panel.append(title);
  if (preorder) panel.append(date);
  panel.append(info);
  if (transfer) panel.append(transferBox(transfer));
  if (!preorder) panel.append(track);
  panel.append(resend, close);
  form.insertAdjacentElement("afterend", panel);
}

// Arma los selects de entrega y de pago con lo que el negocio ofrece (PUBLICO-19). Con una
// sola opción en un grupo se preselecciona y el select se oculta; con varias, hay que elegir
// (solo si el menú viene de Supabase: con un JSON se ve como siempre).
function applyCheckoutOptions(config) {
  if (!CHECKOUT) return;

  const options = CHECKOUT.checkoutOptions(config);
  document
    .querySelector('#form-pedido select[name="pago"]')
    ?.addEventListener("change", renderTransferInfo);
  document
    .querySelector('#form-pedido select[name="pago"]')
    ?.addEventListener("change", syncSubmitLabel);

  [
    ["entrega", options.delivery],
    ["pago", options.payment],
  ].forEach(([name, { options: allowed, single }]) => {
    const select = document.querySelector(`#form-pedido select[name="${name}"]`);
    if (!select) return;

    select.querySelectorAll("option[value]").forEach((option) => {
      if (!allowed.includes(option.value)) option.remove();
    });

    if (single) {
      select.value = single;
      select.hidden = true;
      return;
    }

    if (MENU_SOURCE) {
      // El texto guía tiene que tener valor vacío para que "required" lo cuente como sin elegir.
      select.querySelector("option:disabled")?.setAttribute("value", "");
      select.required = true;
    }
  });
}

// Envío con repartidor (ENVIO-20): el select de barrio y la dirección se ven (y se exigen) solo con
// entrega "delivery" y barrios disponibles. Los campos ocultos quedan deshabilitados. El teléfono
// está siempre (ENVIO-87). Todo con textContent: el nombre del barrio no se interpreta como HTML.
function renderCourierFields() {
  const box = document.querySelector("#envio-repartidor");
  if (!box || !DZ) return;

  const delivery = document.querySelector('#form-pedido select[name="entrega"]');
  const zone = box.querySelector('select[name="barrio"]');
  const address = box.querySelector('input[name="direccion"]');
  if (!zone || !address) return;

  const show = DZ.needsCourier(COURIER_ZONES, delivery?.value);
  box.hidden = !show;

  [zone, address].forEach((field) => {
    field.disabled = !show;
    field.required = show;
  });

  if (show) {
    const previous = zone.value;
    zone.querySelectorAll("option:not([disabled])").forEach((option) => option.remove());
    COURIER_ZONES.zones.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.name;
      zone.append(option);
    });
    // Si el barrio que había elegido ya no está, vuelve a elegir.
    zone.value = COURIER_ZONES.zones.some((item) => item.id === previous) ? previous : "";
  }

  renderZoneNotice();
}

function renderZoneNotice() {
  const notice = document.querySelector("#aviso-barrio");
  const zone = document.querySelector('#form-pedido select[name="barrio"]');
  if (!notice || !zone || !DZ) return;

  const chosen = zone.disabled ? null : DZ.findZone(COURIER_ZONES, zone.value);
  notice.hidden = !chosen;
  notice.textContent = chosen ? tr("checkout.zoneNotice", DZ.zoneNoticeVars(chosen, PRICE.formatPrice)) : "";

  renderNoCouriersNotice(chosen);
}

// Aviso de "puede que no haya repartidores" (ENVIO-198): con envío y una zona elegida, si la base dice que no
// hay nadie disponible. No bloquea nada: se puede pedir igual. Si la consulta falla, no se muestra.
let noCouriersToken = 0;
async function renderNoCouriersNotice(chosen) {
  const notice = document.querySelector("#aviso-sin-repartidores");
  if (!notice) return;

  // Solo vale la respuesta de la última zona elegida: una más lenta de la anterior no pisa a la nueva.
  const token = ++noCouriersToken;
  notice.hidden = true;
  if (!chosen || !AVAILABILITY || !MENU_SOURCE) return;

  const result = await checkZoneCouriers(chosen.id);
  if (token !== noCouriersToken) return;

  const show = AVAILABILITY.showNoCouriersNotice(result);
  notice.hidden = !show;
  notice.textContent = show ? tr("checkout.noCouriers") : "";
}

function initCourierFields() {
  document.querySelector('#form-pedido select[name="entrega"]')?.addEventListener("change", renderCourierFields);
  document.querySelector('#form-pedido select[name="barrio"]')?.addEventListener("change", renderZoneNotice);
  renderCourierFields();
}

// Zona del cliente al entrar (PUBLICO-73 a 78). Solo con envío y barrios; la tarjeta ayuda, pero
// el checkout valida la zona como siempre. Los nombres de barrio van con textContent.
function initZoneChoice(config, slug) {
  const options = CHECKOUT?.checkoutOptions(config).delivery.options;
  ZONE_ON = Boolean(MENU_SOURCE && ZONE.askZone({ zones: COURIER_ZONES, deliveryOptions: options }));
  if (!ZONE_ON) return;

  ZONE_PICKUP = options.includes("retiro");
  const raw = ZONE.readChoice(window.localStorage, slug);
  ZONE_CHOICE = ZONE.validateChoice(raw, COURIER_ZONES, { pickup: ZONE_PICKUP });
  if (raw && !ZONE_CHOICE) ZONE.clearChoice(window.localStorage, slug);

  ZONE_STEP = ZONE_CHOICE ? null : "ask";
  if (ZONE_CHOICE) applyZoneToCheckout(ZONE_CHOICE);
  renderZone();

  // Si el cliente cambia la entrega o el barrio en el checkout, el chip y lo guardado lo siguen.
  const sync = () => syncZoneFromCheckout(slug);
  document.querySelector('#form-pedido select[name="entrega"]')?.addEventListener("change", sync);
  document.querySelector('#form-pedido select[name="barrio"]')?.addEventListener("change", sync);

  document.addEventListener("keydown", onZoneKeydown);
  // Tocar el fondo oscurecido cierra el diálogo, como Escape.
  // Solo si el toque empezó y terminó en el fondo: arrastrar una selección desde el buscador no lo cierra.
  let pressedBackdrop = false;
  document.querySelector("#zona-card")?.addEventListener("pointerdown", (event) => {
    pressedBackdrop = event.target === event.currentTarget;
  });
  document.querySelector("#zona-card")?.addEventListener("click", (event) => {
    if (pressedBackdrop && event.target === event.currentTarget) closeZoneDialog();
    pressedBackdrop = false;
  });

  document.querySelector("#zona-chip")?.addEventListener("click", () => {
    ZONE_STEP = "ask";
    renderZone();
    document.querySelector("#zona-card")?.scrollIntoView({ block: "nearest" });
  });
}

function syncZoneFromCheckout(slug) {
  const entrega = document.querySelector('#form-pedido select[name="entrega"]')?.value;
  const barrio = document.querySelector('#form-pedido select[name="barrio"]')?.value;
  // Con el envío bloqueado el checkout no cambia la elección: se sale con el chip (PUBLICO-80).
  if (ZONE.deliveryBlocked(ZONE_CHOICE)) return;
  let next = null;
  if (entrega === "retiro") next = { type: "pickup" };
  else if (entrega === "delivery" && barrio && DZ.findZone(COURIER_ZONES, barrio)) {
    next = { type: "zone", zoneId: barrio };
  }
  if (!next) return;

  ZONE_CHOICE = next;
  ZONE.saveChoice(window.localStorage, slug, next);
  if (ZONE_STEP === "confirmed") ZONE_STEP = null;
  renderZone();
}

// Deja el checkout con el envío y la zona elegidos, o con el retiro.
function applyZoneToCheckout(choice) {
  const entrega = document.querySelector('#form-pedido select[name="entrega"]');
  if (!entrega) return;

  const value = choice.type === "zone" ? "delivery" : "retiro";
  if (![...entrega.options].some((option) => option.value === value)) return;

  entrega.value = value;
  renderCourierFields();

  if (choice.type === "zone") {
    const barrio = document.querySelector('#form-pedido select[name="barrio"]');
    if (barrio) barrio.value = choice.zoneId;
    renderZoneNotice();
  }
}

function chooseZone(choice) {
  ZONE_CHOICE = choice;
  // "Mi barrio no está" no se recuerda: al volver se pregunta de nuevo (PUBLICO-80).
  if (choice.type !== "notListed") ZONE.saveChoice(window.localStorage, MENU_SOURCE.slug, choice);
  applyZoneToCheckout(choice);
  ZONE_STEP = choice.type === "zone" ? "confirmed" : choice.type === "notListed" ? "notListed" : null;
  renderZone();
}

function zoneButton(text, onClick, className = "zona-opcion") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = text;
  button.addEventListener("click", onClick);
  return button;
}

function renderZoneList(list, query) {
  list.replaceChildren();
  const found = ZONE.filterZones(COURIER_ZONES.zones, query);
  if (found.length === 0) {
    const empty = document.createElement("p");
    empty.className = "zona-vacia";
    empty.textContent = tr("zone.empty");
    list.append(empty);
    return;
  }
  found.forEach((zone) => {
    const button = zoneButton(zone.name, () => chooseZone({ type: "zone", zoneId: zone.id }));
    const price = document.createElement("span");
    price.className = "zona-precio";
    price.textContent = `$${PRICE.formatPrice(zone.price)}`;
    button.append(price);
    list.append(button);
  });
}

// Cierra el diálogo de la zona sin cambiar la elección (×, Escape o tocar el fondo).
function closeZoneDialog() {
  ZONE_STEP = null;
  renderZone();
}

// Con "Mi barrio no está" el checkout queda solo en retiro: la opción de envío se ve deshabilitada y el aviso
// dice por qué (PUBLICO-80). Al elegir una zona de la lista, vuelve a estar habilitada.
function applyDeliveryBlock() {
  const blocked = Boolean(ZONE_ON && ZONE?.deliveryBlocked(ZONE_CHOICE));
  const entrega = document.querySelector('#form-pedido select[name="entrega"]');
  const notice = document.querySelector("#aviso-sin-envio");

  const option = entrega?.querySelector('option[value="delivery"]');
  if (entrega && option) {
    option.disabled = blocked;
    if (blocked && entrega.value === "delivery") {
      entrega.value = ZONE_PICKUP && entrega.querySelector('option[value="retiro"]') ? "retiro" : "";
      renderCourierFields();
    }
  }

  if (notice) {
    notice.hidden = !blocked;
    notice.textContent = blocked ? tr(ZONE_PICKUP ? "zone.noDelivery" : "zone.noDeliveryOnly") : "";
  }
}

// El diálogo atrapa el foco y bloquea el scroll de atrás (PUBLICO-81). Al cerrarse, el foco vuelve a quien lo abrió.
function onZoneKeydown(event) {
  const card = document.querySelector("#zona-card");
  if (!card || card.hidden) return;

  if (event.key === "Escape") {
    event.preventDefault();
    closeZoneDialog();
    return;
  }
  if (event.key !== "Tab") return;

  const focusables = [...card.querySelectorAll("button, input")].filter((el) => !el.disabled && !el.hidden);
  if (focusables.length === 0) return;

  const next = ZONE.nextFocusIndex(focusables.indexOf(document.activeElement), focusables.length, event.shiftKey);
  event.preventDefault();
  focusables[next].focus();
}

function renderZone() {
  const card = document.querySelector("#zona-card");
  const chip = document.querySelector("#zona-chip");
  if (!card || !chip || !ZONE) return;

  const wasOpen = !card.hidden;
  chip.hidden = !ZONE_ON;
  card.hidden = !ZONE_ON || !ZONE_STEP;
  if (!wasOpen && !card.hidden) ZONE_RETURN_FOCUS = document.activeElement;

  if (ZONE_ON) {
    const zone = ZONE_CHOICE?.type === "zone" ? DZ.findZone(COURIER_ZONES, ZONE_CHOICE.zoneId) : null;
    const compactHeader = document.documentElement.dataset.template === "moderno" &&
      window.matchMedia("(max-width: 639px)").matches;
    const prefix = compactHeader ? "" : "📍 ";
    chip.textContent = zone
      ? `${prefix}${zone.name}`
      : ZONE_CHOICE?.type === "pickup"
        ? `${prefix}${tr("zone.chipPickup")}`
        : ZONE_CHOICE?.type === "notListed"
          ? `${prefix}${tr("zone.chipNoDelivery")}`
          : `${prefix}${tr("zone.change")}`;
    chip.setAttribute("aria-label", tr("zone.change"));
    if (
      document.documentElement.dataset.template === "moderno" &&
      window.matchMedia("(max-width: 639px)").matches
    ) {
      const estado = document.querySelector("#estado-texto")?.textContent || "";
      const descripcion = document.querySelector("#descripcion-negocio")?.textContent || "";
      const lineaTexto = document.querySelector("#linea-estado-texto");
      if (lineaTexto) lineaTexto.textContent = ZONE_CHOICE ? estado : descripcion ? `${estado} · ${descripcion}` : estado;
    }
  }

  applyDeliveryBlock();
  document.body.classList.toggle("zona-abierta", !card.hidden);

  if (card.hidden) {
    if (wasOpen && ZONE_RETURN_FOCUS?.isConnected) ZONE_RETURN_FOCUS.focus?.();
    ZONE_RETURN_FOCUS = null;
    return;
  }

  card.replaceChildren();
  // En el celular es una hoja desde abajo; en escritorio, un diálogo centrado con el fondo oscurecido (PUBLICO-80).
  const panel = document.createElement("div");
  panel.className = "zona-dialogo";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "zona-titulo");

  const title = document.createElement("h2");
  title.id = "zona-titulo";
  title.className = "zona-titulo";
  const close = zoneButton("×", closeZoneDialog, "zona-cerrar");
  close.setAttribute("aria-label", tr("zone.close"));
  const back = () =>
    zoneButton(
      tr("zone.back"),
      () => {
        ZONE_STEP = "ask";
        renderZone();
      },
      "zona-volver",
    );

  if (ZONE_STEP === "ask") {
    title.textContent = tr("zone.question");
    const row = document.createElement("div");
    row.className = "zona-acciones";
    row.append(
      zoneButton(tr("zone.delivery"), () => {
        ZONE_QUERY = "";
        ZONE_STEP = "zones";
        renderZone();
      }),
    );
    if (ZONE_PICKUP) row.append(zoneButton(tr("zone.pickup"), () => chooseZone({ type: "pickup" })));
    panel.append(close, title, row);
  } else if (ZONE_STEP === "zones") {
    title.textContent = tr("zone.delivery");
    const search = document.createElement("input");
    search.type = "search";
    search.className = "zona-buscar";
    search.placeholder = tr("zone.search");
    search.setAttribute("aria-label", tr("zone.search"));
    search.autocomplete = "off";
    const list = document.createElement("div");
    list.className = "zona-lista";
    search.value = ZONE_QUERY;
    renderZoneList(list, ZONE_QUERY);
    search.addEventListener("input", () => {
      ZONE_QUERY = search.value;
      renderZoneList(list, ZONE_QUERY);
    });
    // "Mi barrio no está" bloquea el envío al instante (PUBLICO-80).
    const notListed = zoneButton(tr("zone.notListed"), () => chooseZone({ type: "notListed" }), "zona-no-esta");
    panel.append(close, title, search, list, notListed, back());
  } else if (ZONE_STEP === "notListed") {
    title.textContent = tr(ZONE_PICKUP ? "zone.noDelivery" : "zone.noDeliveryOnly");
    panel.append(close, title);
    if (ZONE_PICKUP) panel.append(zoneButton(tr("zone.pickupOffer"), () => chooseZone({ type: "pickup" })));
    panel.append(back());
  } else if (ZONE_STEP === "confirmed") {
    const zone = DZ.findZone(COURIER_ZONES, ZONE_CHOICE?.zoneId);
    if (!zone) {
      ZONE_STEP = null;
      renderZone();
      return;
    }
    title.textContent = tr("zone.available", ZONE.zoneLabel(zone, PRICE.formatPrice));
    panel.append(close, title);
  }

  card.append(panel);
  // El foco entra al diálogo: el buscador si hay, si no la primera opción.
  (panel.querySelector(".zona-buscar") ?? panel.querySelector(".zona-opcion") ?? panel.querySelector("button"))?.focus();
}

// Para cuándo es el pedido (PUBLICO-30): con un menú de Supabase que acepta pedidos
// programados, "Lo antes posible" o "Programar" con las horas de hoy; si no los acepta, no hay
// elección; con un menú de un JSON, el campo de hora libre de siempre.
function renderScheduleChoice() {
  if (!CHECKOUT) return;

  const libre = document.querySelector("#horario-libre");
  const programado = document.querySelector("#horario-programado");
  const hour = programado?.querySelector('select[name="hora"]');
  if (!libre || !programado || !hour) return;

  // Un pedido anticipado es para la próxima apertura: no se elige hora.
  const choice = currentPreorder(window.CONFIG)
    ? { mode: "none" }
    : CHECKOUT.scheduleChoice(window.CONFIG, Boolean(MENU_SOURCE));
  libre.hidden = choice.mode !== "free";
  programado.hidden = choice.mode !== "slots";
  if (choice.mode !== "slots") return;

  const previous = hour.value;
  hour.querySelectorAll("option:not([disabled])").forEach((option) => option.remove());
  choice.slots.forEach(({ value, iso }) => {
    const option = document.createElement("option");
    option.value = iso;
    option.textContent = value;
    hour.append(option);
  });
  // Si la hora que había elegido ya no está disponible, vuelve a elegir.
  hour.value = choice.slots.some((slot) => slot.iso === previous) ? previous : "";

  syncScheduleSelects();
}

// Las horas solo se muestran (y se exigen) al elegir "Programar".
function syncScheduleSelects() {
  const when = document.querySelector('#horario-programado select[name="cuando"]');
  const hour = document.querySelector('#horario-programado select[name="hora"]');
  if (!when || !hour) return;

  const scheduling = when.value === "schedule";
  hour.hidden = !scheduling;
  hour.required = scheduling;
  if (!scheduling) hour.value = "";
}

document
  .querySelector('#horario-programado select[name="cuando"]')
  ?.addEventListener("change", syncScheduleSelects);

// Con un solo tipo de entrega no hay select: el aviso le dice al cliente cómo se entrega
// (PUBLICO-22). Va con textContent y se vuelve a armar al cambiar de idioma.
function renderDeliveryNotice() {
  const node = document.querySelector("#aviso-entrega");
  if (!node || !CHECKOUT) return;

  const notice = CHECKOUT.deliveryNotice(window.CONFIG);
  node.hidden = !notice;
  if (!notice) return;

  node.textContent =
    notice.kind === "delivery"
      ? tr("checkout.onlyDelivery")
      : notice.address
        ? tr("checkout.onlyPickupAt", { address: notice.address })
        : tr("checkout.onlyPickup");
}

// Con Mercado Pago el botón dice que se paga ahí y no que se envía por WhatsApp (PUBLICO-36). Un
// botón desactivado (negocio cerrado, enviando) conserva su texto.
function syncSubmitLabel() {
  const submit = document.querySelector('#form-pedido button[type="submit"]');
  const select = document.querySelector('#form-pedido select[name="pago"]');
  if (!submit || !select || submit.disabled || !MERCADOPAGO) return;

  if (MERCADOPAGO.isMercadoPago(select.value)) {
    submit.textContent = tr("tracker.pay.button");
  } else {
    submit.textContent = currentPreorder(window.CONFIG) ? tr("preorder.submit") : tr("checkout.submit");
  }
}

// Al elegir transferencia, el cliente ve ya los datos para pagar (PUBLICO-20).
function renderTransferInfo() {
  const box = document.querySelector("#datos-transferencia");
  const select = document.querySelector('#form-pedido select[name="pago"]');
  if (!box || !select || !CHECKOUT) return;

  const transfer = CHECKOUT.transferDetails(window.CONFIG, select.value);
  box.replaceChildren(...(transfer ? [transferBox(transfer)] : []));
  box.hidden = !transfer;
}

// Alias y CBU/CVU para transferir, cada uno con su botón "Copiar". Todo con textContent: lo
// que cargó el negocio nunca se interpreta como HTML (PUBLICO-20).
function transferBox(transfer) {
  const box = document.createElement("div");
  box.className = "gracias-transferencia";

  const heading = document.createElement("p");
  heading.className = "gracias-aviso";
  heading.textContent = tr("thanks.transfer");
  box.append(heading);

  [
    ["checkout.alias", transfer.alias],
    ["checkout.cbu", transfer.cbu],
  ].forEach(([labelKey, value]) => {
    if (!value) return;

    const row = document.createElement("div");
    row.className = "gracias-dato";

    const label = document.createElement("span");
    label.className = "gracias-dato-etiqueta";
    label.textContent = tr(labelKey);

    const text = document.createElement("strong");
    text.className = "gracias-dato-valor";
    text.textContent = value;

    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = tr("thanks.copy");
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(value);
        copy.textContent = tr("thanks.copied");
        setTimeout(() => {
          copy.textContent = tr("thanks.copy");
        }, 2000);
      } catch {
        // Sin permiso para el portapapeles: el dato queda a la vista para copiarlo a mano.
      }
    });

    row.append(label, text, copy);
    box.append(row);
  });

  return box;
}

// Al volver de WhatsApp con la página recargada: si hay un pedido reciente sin cerrar,
// se vuelve a mostrar su panel.
function restoreThanks() {
  if (!MENU_SOURCE || !ORDERS) return;

  const last = ORDERS.lastOrder(window.localStorage);
  const whatsappUrl = last && ORDERS.handoffUrl(window.localStorage, last.code);
  if (!last || !whatsappUrl) return;

  showThanks({
    number: last.number,
    code: last.code,
    link: ORDERS.trackingLink(window.location.origin, last.code, LANG),
    whatsappUrl,
    transfer: CHECKOUT?.transferDetails(CONFIG, last.payment) ?? null,
  });
  openCheckout();
}

// Vuelve el checkout a su estado normal (formulario visible, sin el "gracias").
function resetCheckout() {
  document.querySelector("#gracias-pedido")?.remove();
  $("#form-pedido")?.classList.remove("hidden");
}

// VISTA PREVIA (PUBLICO-58 a 61)
// Espera `{ type: "preview", config, menu }` de un origen permitido, lo valida y lo dibuja con el mismo
// código que el menú público. Una configuración nueva se vuelve a dibujar sin recargar la página; si
// llegan varias seguidas, se dibuja la última. Nada de esto se ejecuta fuera de `?preview=1`.
async function startPreview() {
  const PV = await import("/apps/menu-app/lib/preview.js");
  const LOADER = await import("/apps/menu-app/lib/loader.js");
  // La sección "Animaciones" del panel abre la vista previa con `look=1`: se deja ver el cargador un momento antes
  // de que entre el menú, para que se vea la animación de carga elegida y después la de entrada (PUBLICO-108).
  const HOLD_LOADER = new URLSearchParams(window.location.search).get("look") === "1";

  document.body.classList.add("preview");
  document.querySelector(".cta-section")?.setAttribute("hidden", "");
  document.querySelector(".btn-volver")?.setAttribute("hidden", "");

  // Inerte: ni agregar al carrito, ni abrir el checkout, ni seguir links. Los botones se ven igual.
  const block = (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  ["click", "submit"].forEach((type) => document.addEventListener(type, block, true));

  const allowed = PV.allowedOrigins({
    hostname: window.location.hostname,
    search: window.location.search,
  });

  let brandNames = [];
  let target = null;
  let pending = null;
  let drawing = false;
  let firstDraw = true;

  function reportHeader() {
    const rect = PV.headerRect(document);
    if (!rect || !target) return;
    window.parent.postMessage(
      {
        type: "preview-header",
        rect,
        width: document.documentElement.clientWidth,
        height: document.documentElement.scrollHeight,
      },
      target,
    );
  }

  async function draw({ config, menu }) {
    window.CONFIG = config;
    brandNames = PV.applyPreviewConfig(
      document,
      config,
      COLORS.brandVariables(config.colores),
      brandNames,
    );
    LOOK.applyMenuLook(document, config);
    if (firstDraw) LOADER.applyLoaderAnimation(config);
    await loadTemplate(PV.previewTemplate(config));
    configureModernHeader();

    BASE_MENU = menu;
    MENU_GLOBAL = MENU.buildEnhancedMenu(menu, LANG);
    renderMenu(MENU_GLOBAL);
    renderCategorias(MENU_GLOBAL);
    if (firstDraw) buildLangSelector();
    applyStaticTexts();
    renderHeader(config);

    if (firstDraw && HOLD_LOADER) await new Promise((resolve) => setTimeout(resolve, 2800));
    finishLoading();

    if (firstDraw && typeof ResizeObserver !== "undefined") {
      new ResizeObserver(reportHeader).observe(document.body);
    }
    firstDraw = false;
    reportHeader();
  }

  async function drain() {
    drawing = true;
    try {
      while (pending) {
        const next = pending;
        pending = null;
        await draw(next);
      }
    } catch (err) {
      console.error("No se pudo dibujar la vista previa:", err);
    } finally {
      drawing = false;
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || !PV.isAllowedOrigin(event.origin, allowed)) return;

    const parsed = PV.parsePreviewMessage(event.data);
    if (!parsed) return;

    target = event.origin;
    pending = parsed;
    if (!drawing) drain();
  });

  // Avisa que está lista para recibir datos (no lleva nada del negocio, por eso va a cualquier origen).
  window.parent.postMessage({ type: "preview-ready" }, "*");
}

// INIT
init();

// DESHABILITAR HORA SI "AHORA MISMO"
$('input[name="ahora"]')?.addEventListener("change", (e) => {
  const timeInput = $('input[name="horario"]');
  if (!timeInput) return;

  timeInput.disabled = e.target.checked;
  if (e.target.checked) timeInput.value = "";
});
