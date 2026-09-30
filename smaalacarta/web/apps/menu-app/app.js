let cart = [];
let MENU_GLOBAL = null;

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

// Idioma de la interfaz (IDIOMA-1 a 4) y el menú tal como vino, sin las secciones armadas.
let LANG = "es";
let BASE_MENU = null;
let LAST_THANKS = null;
let syncTema = () => {};

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
    ]);
    PRICE = priceLib;
    COLORS = colorsLib;
    I18N = i18nLib;
    LANG = I18N.resolveLang({
      search: window.location.search,
      navigatorLanguage: navigator.language,
    });
    SCHEDULE = schedule;
    PWA = pwa;
    MENU = menuLib;
    HTML = html;
    INFO = info;
    ORDERS = orders;
    SUPABASE_CFG = supabaseConfig.SUPABASE;

    const result = resolveAppConfig(resolveBusinessFromHost, resolveDemoFromPath);
    if (!result) {
      console.error("No se encontró slug en la URL");
      return;
    }

    const { slug, type } = result;

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

    window.CONFIG = config;
    document.documentElement.dataset.template = config.template || "";
    document.documentElement.dataset.tema = config.tema || "claro";

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

    // Switch de tema: solo en las demos, para mostrar cómo se ve cada plantilla
    // en los dos temas sin tener que cargar un negocio real en oscuro.
    const btnTema = document.getElementById("btn-tema");
    if (btnTema) {
      btnTema.hidden = !demo;
      if (demo) {
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
          document.documentElement.dataset.tema =
            document.documentElement.dataset.tema === "oscuro" ? "claro" : "oscuro";
          syncTema();
        });
      }
    }

    // 🎨 Colores dinámicos
    // (con el texto que se lee sobre ellos: un negocio puede elegir colores claros)
    const brandVars = COLORS.brandVariables(config.colores);
    for (const [name, value] of Object.entries(brandVars)) {
      if (value) document.documentElement.style.setProperty(name, value);
    }

    // ⏳ Esperar que cargue el CSS del template
    await loadTemplate(config.template);

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
    restoreThanks();

    // 🧹 Ocultar loader correctamente
    document.body.classList.remove("loading");
    const loader = document.getElementById("loader");
    if (loader) loader.style.display = "none";
  } catch (err) {
    console.error("Error en init:", err);
    document.body.innerHTML = `<h2>${I18N ? tr("error.unexpected") : "Error inesperado"}</h2>`;
  }
}

// IDIOMA-4: selector ES/EN/PT. Cambiar de idioma vuelve a dibujar sin recargar la página.
function buildLangSelector() {
  const box = document.getElementById("selector-idioma");
  if (!box) return;

  I18N.LANGS.forEach((lang) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = lang.toUpperCase();
    b.dataset.lang = lang;
    b.addEventListener("click", () => setLang(lang));
    box.appendChild(b);
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

  const box = document.getElementById("selector-idioma");
  if (box) {
    box.setAttribute("aria-label", tr("lang.label"));
    box.querySelectorAll("button").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.lang === LANG));
    });
  }

  syncTema();
}

function setLang(lang) {
  if (lang === LANG || !I18N.LANGS.includes(lang)) return;
  LANG = lang;

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

function loadTemplate(template) {
  return new Promise((resolve, reject) => {
    if (!template) {
      console.warn("No se especificó template");
      resolve();
      return;
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `/templates/carrito/${template}/styles.css`;

    // Después de la plantilla, y solo en pantallas anchas, el ajuste de escritorio
    // (PUBLICO-14). Si no carga, el menú se ve como antes.
    const addDesktop = () => {
      const desktop = document.createElement("link");
      desktop.rel = "stylesheet";
      desktop.href = "/apps/menu-app/desktop.css";
      desktop.media = "(min-width: 1024px)";
      desktop.onload = desktop.onerror = () => resolve();
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

// RENDER
function renderHeader(c) {
  const nombreEl = document.querySelector("#nombre-negocio");
  const descEl = document.querySelector("#descripcion-negocio");
  const estadoEl = document.querySelector("#estado-texto");
  const header = document.querySelector(".header");
  const dot = document.querySelector(".badge-estado .dot");

  if (nombreEl) nombreEl.textContent = c.nombre || "";
  if (descEl) descEl.textContent = c.descripcion || "";

  if (header) {
    const background = INFO.headerBackground(c, HTML.cssUrl);
    if (background) header.style.backgroundImage = background;
  }

  const cierre = INFO.closedNotice(c);
  const fueraDeHorario = !cierre && !SCHEDULE.isOpenNow(c.horarios);
  const abierto = !cierre && !fueraDeHorario;

  renderInfo(c, cierre, fueraDeHorario);

  if (estadoEl) {
    estadoEl.textContent = tr(abierto ? "status.open" : "status.closed");
  }

  if (dot) {
    dot.style.background = abierto ? "#4ade80" : "#ef4444";
  }
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
function renderInfo(c, cierre, fueraDeHorario = false) {
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
    aviso.textContent = [
      tr("closed.now"),
      SCHEDULE.openingText(SCHEDULE.nextOpening(c.horarios), LANG),
    ]
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
    enviar.disabled = Boolean(cierre) || fueraDeHorario;
    if (cierre) enviar.textContent = tr("closed.temporary");
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

      if (p.promo) {
        d.setAttribute("data-promo", p.promo);
      }

      const imagen = HTML.safeHttpUrl(p.imagen);

      d.innerHTML = `
        ${imagen ? `<img src="${HTML.escapeHtml(imagen)}" alt="">` : ""}
        <div class="producto-info">
          <h3>${HTML.escapeHtml(p.nombre)}</h3>
          <p>${HTML.escapeHtml(p.descripcion || "")}</p>
          ${p.precioAnterior ? `<span class="precio-anterior">$${HTML.escapeHtml(PRICE.formatPrice(p.precioAnterior))}</span>` : ""}
          <div class="producto-precio">$${HTML.escapeHtml(PRICE.formatPrice(p.precio))}</div>
        </div>
        <button class="btn-add">+</button>
      `;

      const btn = d.querySelector(".btn-add");

      btn.onclick = () => {
        addToCart(p);

        // 🎯 animación producto
        d.classList.add("adding");
        setTimeout(() => d.classList.remove("adding"), 350);

        // 🎯 animación botón
        btn.classList.add("added");
        btn.textContent = "✓";

        setTimeout(() => {
          btn.classList.remove("added");
          btn.textContent = "+";
        }, 600);
      };

      grid.appendChild(d); // 👈 clave
    });

    menuContainer.appendChild(sec);
  });
}

function initSearch() {
  const input = document.querySelector("#buscador");
  const menuContainer = document.querySelector("#menu");

  if (!input || !menuContainer) return;

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

// CARRITO
function addToCart(p) {
  if (!p) return;

  // Con id (menú de Supabase) se agrupa por id; los menús de JSON, por nombre.
  const existente = cart.find((i) => (p.id ? i.id === p.id : i.nombre === p.nombre));

  if (existente) {
    existente.cantidad++;
  } else {
    cart.push({ ...p, cantidad: 1 });
  }

  saveCart();
  updateCart();
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

    d.innerHTML = `
      <div class="item-info">
        <h4>${HTML.escapeHtml(i.nombre || "")}</h4>
        <span class="item-precio">$${HTML.escapeHtml(PRICE.formatPrice(i.precio))}</span>
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
  localStorage.setItem("cart", JSON.stringify(cart));
}

function loadCart() {
  const c = localStorage.getItem("cart");
  if (c) cart = JSON.parse(c);
  updateCart();
}

// UI (más moderno + seguro)
const $ = (sel) => document.querySelector(sel);

$("#btn-carrito")?.addEventListener("click", () => {
  $("#carrito-panel")?.classList.add("active");
  $("#overlay")?.classList.add("active");
  document.body.classList.add("no-scroll");
});

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
}

$("#btn-finalizar")?.addEventListener("click", () => {
  $("#carrito-panel")?.classList.remove("active");
  $("#overlay")?.classList.remove("active");
  $("#checkout")?.classList.add("active");
});

$("#cerrar-checkout")?.addEventListener("click", closeAll);

// WHATSAPP
$("#form-pedido")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  // La página puede haber quedado abierta desde antes de que el negocio cerrara.
  if (INFO?.closedNotice(window.CONFIG)) {
    alert(tr("error.closedTemporary"));
    return;
  }
  if (SCHEDULE && !SCHEDULE.isOpenNow(window.CONFIG?.horarios)) {
    alert(
      [tr("error.closedNow"), SCHEDULE.openingText(SCHEDULE.nextOpening(window.CONFIG?.horarios), LANG)]
        .filter(Boolean)
        .join(" "),
    );
    return;
  }

  const form = e.target;
  const f = new FormData(form);

  let total = 0;

  let msg = `🍔 *Nuevo pedido*\n\n`;

  msg += `👤 Cliente: ${f.get("nombre")}\n`;
  msg += `🚚 Entrega: ${f.get("entrega")}\n`;

  const ahora = f.get("ahora");
  const horario = f.get("horario");

  if (ahora) {
    msg += `⏰ Horario: Ahora mismo\n`;
  } else if (horario) {
    msg += `⏰ Horario: ${horario}\n`;
  }

  msg += `💳 Pago: ${f.get("pago")}\n`;

  const notas = f.get("notas");
  if (notas) msg += `📝 Notas: ${notas}\n`;

  msg += `\n🧾 *Detalle del pedido:*\n\n`;

  cart.forEach((i) => {
    const precio = i.precio || 0; // importante si algún item no lo tiene
    const subtotal = precio * i.cantidad;

    total += subtotal;

    msg += `• ${i.nombreEs ?? i.nombre} x${i.cantidad}\n`;
    msg += `  $${PRICE.formatPrice(precio)} c/u → $${PRICE.formatPrice(subtotal)}\n\n`;
  });

  msg += `━━━━━━━━━━━━━━\n`;
  msg += `💰 *TOTAL: $${PRICE.formatPrice(total)}*\n\n`;
  msg += `📲 SMA a la Carta`;

  // Si el menú viene de Supabase, el pedido se guarda primero en el sistema para poder
  // seguirlo. Si no se puede (menú de JSON, sin conexión…), sigue por WhatsApp como siempre.
  const items = MENU_SOURCE && ORDERS ? ORDERS.buildOrderItems(cart) : null;
  let saved = null;

  if (items) {
    const submit = form.querySelector("button[type='submit']");
    if (submit) {
      submit.disabled = true;
      submit.textContent = tr("checkout.sending");
    }

    const horarioNota = ahora ? "Horario: ahora mismo" : horario ? `Horario: ${horario}` : "";
    const result = await ORDERS.createOrder({
      ...SUPABASE_CFG,
      slug: MENU_SOURCE.slug,
      customer: f.get("nombre") || "",
      delivery: f.get("entrega") || "",
      payment: f.get("pago") || "",
      notes: [horarioNota, f.get("notas") || ""].filter(Boolean).join(" · ").slice(0, 500),
      items,
    });

    if (submit) {
      submit.disabled = false;
      submit.textContent = tr("checkout.submit");
    }

    if (result.ok) {
      saved = result;
    } else if (result.reason === "closed") {
      alert(tr("error.closedTemporary"));
      return;
    } else if (result.reason === "outside_hours") {
      alert(tr("error.outsideHours"));
      return;
    } else if (result.reason === "busy") {
      alert(tr("error.busy"));
      return;
    } else if (result.reason === "unavailable") {
      alert(tr("error.unavailable"));
      return;
    }
    // "invalid" y "unknown": se manda solo por WhatsApp.
  }

  const link = saved ? ORDERS.trackingLink(window.location.origin, saved.code) : "";
  if (saved) msg = ORDERS.finalizeOrderMessage(msg, { number: saved.number, link });

  const whatsappUrl = ORDERS
    ? ORDERS.whatsappOrderUrl(CONFIG.telefono, msg)
    : `https://api.whatsapp.com/send?phone=${CONFIG.telefono}&text=${encodeURIComponent(msg)}`;

  cart = [];
  saveCart();
  updateCart();

  if (saved) {
    // Se anota el pedido antes de salir: si el navegador recarga la página al volver de
    // WhatsApp, el panel se muestra de nuevo (SEGUIMIENTO-10).
    ORDERS.rememberHandoff(window.localStorage, saved.code, whatsappUrl);
    ORDERS.rememberLastOrder(window.localStorage, saved);
    showThanks({ number: saved.number, code: saved.code, link, whatsappUrl });
    // Misma pestaña: window.open lo bloquea el navegador después de esperar la respuesta.
    ORDERS.markHandoffSent(window.localStorage, saved.code);
    window.location.href = whatsappUrl;
  } else {
    window.open(whatsappUrl);
    closeAll();
  }
});

// "Pedido registrado": WhatsApp se abre solo al confirmar; este panel es lo que el cliente
// ve al volver. El botón principal lleva al seguimiento y, aparte, un link chico permite
// reenviar el mensaje si WhatsApp no se abrió (SEGUIMIENTO-10). Todo con textContent: el
// número y los links no se interpretan como HTML.
function showThanks(data) {
  const { number, code, link, whatsappUrl } = data;
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

  const track = document.createElement("a");
  track.className = "btn-seguimiento destacado";
  // El seguimiento se abre en el mismo idioma (IDIOMA-7).
  track.href = `${link}?lang=${LANG}`;
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

  panel.append(title, info, track, resend, close);
  form.insertAdjacentElement("afterend", panel);
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
    link: ORDERS.trackingLink(window.location.origin, last.code),
    whatsappUrl,
  });
  $("#overlay")?.classList.add("active");
  $("#checkout")?.classList.add("active");
  document.body.classList.add("no-scroll");
}

// Vuelve el checkout a su estado normal (formulario visible, sin el "gracias").
function resetCheckout() {
  document.querySelector("#gracias-pedido")?.remove();
  $("#form-pedido")?.classList.remove("hidden");
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
