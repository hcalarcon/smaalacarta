let cart = [];
let MENU_GLOBAL = null;

// Módulos de /lib, cargados en init(): escape de HTML y datos del negocio.
let HTML = null;
let INFO = null;
let ORDERS = null;

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

//nueva funcion hardcodeada
function resolveAppConfig(resolveHost) {
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
  3. FALLBACK (MVP)
  ========================================
  */
  console.warn("Dominio no reconocido:", host, "→ fallback a demo moderno");

  return {
    slug: "moderno",
    type: "demo",
  };
}

function getSlug() {
  const params = new URLSearchParams(window.location.search);

  // 1. prioridad: query (DEV)
  if (params.get("demo")) {
    return { slug: params.get("demo"), type: "demo" };
  }

  if (params.get("cliente")) {
    return { slug: params.get("cliente"), type: "cliente" };
  }

  // 2. subdominio (PROD)
  const host = window.location.hostname;
  const parts = host.split(".");

  if (parts.length < 3) {
    return null; // localhost o sin subdominio
  }

  const subdomain = parts[0];

  // evitar subdominios internos
  const RESERVED = ["www", "demo", "app", "admin"];
  if (RESERVED.includes(subdomain)) return null;

  // 🔥 decisión inteligente:
  // si NO viene por query, asumimos cliente
  return { slug: subdomain, type: "cliente" };
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
    const [{ resolveBusinessFromHost }, html, info, orders, supabaseConfig] =
      await Promise.all([
        import("/apps/menu-app/lib/hostname.js"),
        import("/apps/menu-app/lib/html.js"),
        import("/apps/menu-app/lib/info.js"),
        import("/apps/menu-app/lib/orders.js"),
        import("/apps/menu-app/supabase-config.js"),
      ]);
    HTML = html;
    INFO = info;
    ORDERS = orders;
    SUPABASE_CFG = supabaseConfig.SUPABASE;

    const result = resolveAppConfig(resolveBusinessFromHost);
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
      if (!config) return;

      menu = await fetchJSON(`${basePath}/${slug}/menu.json`);
      if (!menu) return;
    }

    window.CONFIG = config;

    // 🎨 Colores dinámicos
    if (config.colores) {
      const root = document.documentElement;
      if (config.colores.primary) {
        root.style.setProperty("--color-primary", config.colores.primary);
      }
      if (config.colores.secondary) {
        root.style.setProperty("--color-secondary", config.colores.secondary);
      }
    }

    // ⏳ Esperar que cargue el CSS del template
    await loadTemplate(config.template);

    if (!menu) {
      console.error("No se pudo cargar menú");
      document.body.innerHTML = "<h2>Error cargando menú</h2>";
      return;
    }

    const enhancedMenu = buildEnhancedMenu(menu);

    MENU_GLOBAL = enhancedMenu;
    renderMenu(enhancedMenu);

    renderHeader(config);
    renderCategorias(enhancedMenu);

    //renderMenu(menu);
    initSearch();
    loadCart();

    // 🧹 Ocultar loader correctamente
    document.body.classList.remove("loading");
    const loader = document.getElementById("loader");
    if (loader) loader.style.display = "none";
  } catch (err) {
    console.error("Error en init:", err);
    document.body.innerHTML = "<h2>Error inesperado</h2>";
  }
}
// INIT
function getAppContext() {
  const params = new URLSearchParams(window.location.search);
  const host = window.location.hostname;
  const path = window.location.pathname;

  /*
    ========================================
    1. PRIORIDAD: QUERY (modo desarrollo)
    ========================================
    Ej:
    ?demo=moderno
    ?cliente=don-juan
  */
  const querySlug = params.get("demo") || params.get("cliente");

  if (querySlug) {
    return {
      slug: querySlug,
      source: params.get("demo") ? "demo" : "cliente",
      mode: "app", // por defecto
    };
  }

  /*
    ========================================
    2. SUBDOMINIO (carrito producción)
    ========================================
    Ej:
    don-juan.smaalacarta.com.ar
  */
  const parts = host.split(".");

  if (parts.length >= 3) {
    const subdomain = parts[0];

    // evitamos cosas como www
    if (subdomain !== "www" && subdomain !== "demo") {
      return {
        slug: subdomain,
        source: "cliente",
        mode: "app", // carrito
      };
    }
  }

  /*
    ========================================
    3. PATH (rutas)
    ========================================
    Ej:
    /moderno
    /don-juan/menu
    /don-juan/qr
  */
  const segments = path.split("/").filter(Boolean);

  if (segments.length === 0) {
    return null;
  }

  const slug = segments[0];

  /*
    Detectamos modo:
    - /menu → menú HTML
    - /qr → PDF
    - default → app/demo
  */
  let mode = "app";

  if (segments[1] === "menu") {
    mode = "menu";
  } else if (segments[1] === "qr") {
    mode = "qr";
  }

  /*
    Detectamos si es demo o cliente
    (simple: si estás en demo subdominio → demo)
  */
  const isDemoHost = host.includes("demo.");

  return {
    slug,
    source: isDemoHost ? "demo" : "cliente",
    mode,
  };
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

    link.onload = () => resolve();

    link.onerror = () => {
      console.error("Error cargando template:", template);
      resolve(); // 👈 no rompemos la app
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

  if (header && c.header?.imagen) {
    header.style.backgroundImage = `
      ${HTML.cssUrl(c.header.imagen)},
      linear-gradient(
        135deg,
        var(--color-primary, #463AE5),
        var(--color-secondary, #9A6CE0)
      )
    `;
  }

  const cierre = INFO.closedNotice(c);
  const abierto = !cierre && isAbiertoAhora(c);

  renderInfo(c, cierre);

  if (estadoEl) {
    estadoEl.textContent = abierto ? "Abierto" : "Cerrado";
  }

  if (dot) {
    dot.style.background = abierto ? "#4ade80" : "#ef4444";
  }
}

// Aviso de cierre temporal, dirección y redes, debajo del encabezado. Todo se arma
// con textContent y atributos: lo que escribe el negocio nunca se interpreta como HTML.
function renderInfo(c, cierre) {
  document.querySelectorAll("#aviso-cierre, #info-negocio").forEach((el) => el.remove());

  const header = document.querySelector(".header");
  if (!header) return;

  const bloques = [];

  if (cierre) {
    const aviso = document.createElement("div");
    aviso.id = "aviso-cierre";
    aviso.className = "cierre-temporal";
    aviso.setAttribute("role", "status");
    aviso.textContent = [
      "Cerrado temporalmente",
      cierre.message,
      INFO.reopenText(cierre.reopensOn),
    ]
      .filter(Boolean)
      .join(" · ");
    bloques.push(aviso);
  }

  const links = INFO.socialLinks(c);
  const mapa = INFO.mapsUrl(c.direccion);

  if (mapa || links.length > 0) {
    const info = document.createElement("div");
    info.id = "info-negocio";
    info.className = "info-negocio";

    if (mapa) {
      const a = document.createElement("a");
      a.href = mapa;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "📍 " + c.direccion;
      info.appendChild(a);
    }

    links.forEach((link) => {
      const a = document.createElement("a");
      a.href = link.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = link.name;
      info.appendChild(a);
    });

    bloques.push(info);
  }

  // Orden final: aviso de cierre y después la info (cada uno va "después del header").
  bloques.reverse().forEach((el) => header.insertAdjacentElement("afterend", el));

  // Cerrado: no se pueden enviar pedidos.
  const enviar = document.querySelector("#form-pedido button[type='submit']");
  if (enviar) {
    enviar.disabled = Boolean(cierre);
    if (cierre) enviar.textContent = "Cerrado temporalmente";
  }
}

function isAbiertoAhora(config) {
  if (!config?.horarios) return true;

  const ahora = new Date();

  const dias = [
    "domingo",
    "lunes",
    "martes",
    "miercoles",
    "jueves",
    "viernes",
    "sabado",
  ];

  const dia = dias[ahora.getDay()];
  const horaActual = ahora.getHours() * 60 + ahora.getMinutes();

  const horariosHoy = config.horarios[dia];

  if (!horariosHoy || horariosHoy.length === 0) return false;

  return horariosHoy.some((rango) => {
    if (!rango.includes("-")) return false;

    const [inicio, fin] = rango.split("-");

    const [h1, m1] = inicio.split(":").map(Number);
    const [h2, m2] = fin.split(":").map(Number);

    const inicioMin = h1 * 60 + m1;
    let finMin = h2 * 60 + m2;

    // Soporte horario nocturno
    if (finMin < inicioMin) {
      return horaActual >= inicioMin || horaActual <= finMin;
    }

    return horaActual >= inicioMin && horaActual <= finMin;
  });
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

function buildEnhancedMenu(menu) {
  if (!menu?.categorias) return menu;

  const destacados = [];
  const ofertas = [];

  menu.categorias.forEach((cat) => {
    (cat.items || []).forEach((item) => {
      if (item.destacado) {
        destacados.push(item);
      }

      if (item.precioAnterior || item.promo) {
        ofertas.push(item);
      }
    });
  });

  const nuevasCategorias = [];

  // ⭐ Destacados
  if (destacados.length > 0) {
    nuevasCategorias.push({
      nombre: "Destacados",
      tipo: "destacados",
      items: destacados,
    });
  }

  // 💸 Ofertas (si el menú ya trae su categoría de ofertas, como las promociones
  // del admin, no se arma otra)
  const yaTieneOfertas = menu.categorias.some((cat) => cat.tipo === "ofertas");

  if (ofertas.length > 0 && !yaTieneOfertas) {
    nuevasCategorias.push({
      nombre: "Ofertas",
      tipo: "ofertas",
      items: ofertas,
    });
  }

  // 👇 después agregamos las originales
  nuevasCategorias.push(...menu.categorias);

  return {
    ...menu,
    categorias: nuevasCategorias,
  };
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
          ${p.precioAnterior ? `<span class="precio-anterior">$${HTML.escapeHtml(p.precioAnterior)}</span>` : ""}
          <div class="producto-precio">$${HTML.escapeHtml(p.precio)}</div>
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
      menuContainer.innerHTML =
        '<div class="no-results"> <div class="no-results-icon">🔍</div>  No se encontraron productos o categorías.</div>';
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
        <span class="item-precio">$${HTML.escapeHtml(i.precio)}</span>
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

  if (INFO?.closedNotice(window.CONFIG)) {
    alert("Estamos cerrados temporalmente: por ahora no podemos tomar pedidos.");
    return;
  }

  const form = e.target;
  const f = new FormData(form);

  const formatPrice = (n) => n.toLocaleString("es-AR");

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

    msg += `• ${i.nombre} x${i.cantidad}\n`;
    msg += `  $${formatPrice(precio)} c/u → $${formatPrice(subtotal)}\n\n`;
  });

  msg += `━━━━━━━━━━━━━━\n`;
  msg += `💰 *TOTAL: $${formatPrice(total)}*\n\n`;
  msg += `📲 SMA a la Carta`;

  // Si el menú viene de Supabase, el pedido se guarda primero en el sistema para poder
  // seguirlo. Si no se puede (menú de JSON, sin conexión…), sigue por WhatsApp como siempre.
  const items = MENU_SOURCE && ORDERS ? ORDERS.buildOrderItems(cart) : null;
  let saved = null;

  if (items) {
    const submit = form.querySelector("button[type='submit']");
    if (submit) {
      submit.disabled = true;
      submit.textContent = "Enviando…";
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
      submit.textContent = "Enviar por WhatsApp";
    }

    if (result.ok) {
      saved = result;
    } else if (result.reason === "closed") {
      alert("Estamos cerrados temporalmente: por ahora no podemos tomar pedidos.");
      return;
    } else if (result.reason === "busy") {
      alert("Estamos recibiendo muchos pedidos. Probá de nuevo en un minuto.");
      return;
    } else if (result.reason === "unavailable") {
      alert("Algún producto ya no está disponible. Recargá el menú para ver lo que hay.");
      return;
    }
    // "invalid" y "unknown": se manda solo por WhatsApp.
  }

  const link = saved ? ORDERS.trackingLink(window.location.origin, saved.code) : "";
  if (link) msg += `\n\n🔎 Seguí tu pedido: ${link}`;

  const whatsappUrl = `https://api.whatsapp.com/send?phone=${CONFIG.telefono}&text=${encodeURIComponent(msg)}`;

  cart = [];
  saveCart();
  updateCart();

  if (saved) {
    // El navegador puede bloquear una ventana abierta después de esperar: por eso se
    // muestra un botón, que sí cuenta como acción del cliente.
    showThanks({ number: saved.number, link, whatsappUrl });
  } else {
    window.open(whatsappUrl);
    closeAll();
  }
});

// "Gracias por tu pedido": reemplaza al formulario, con el botón de WhatsApp y el link de
// seguimiento. Todo con textContent: el número y los links no se interpretan como HTML.
function showThanks({ number, link, whatsappUrl }) {
  const form = $("#form-pedido");
  if (!form) return;

  resetCheckout();
  form.classList.add("hidden");

  const panel = document.createElement("div");
  panel.id = "gracias-pedido";
  panel.className = "gracias-pedido";

  const title = document.createElement("h3");
  title.textContent = "¡Gracias por tu pedido!";

  const num = document.createElement("p");
  num.textContent = `Pedido #${number}`;

  const info = document.createElement("p");
  info.textContent = "Para que el local lo reciba, enviá el mensaje por WhatsApp.";

  const send = document.createElement("a");
  send.className = "btn-whatsapp";
  send.href = whatsappUrl;
  send.target = "_blank";
  send.rel = "noopener noreferrer";
  send.textContent = "Enviar por WhatsApp";

  const track = document.createElement("a");
  track.className = "btn-seguimiento";
  track.href = link;
  track.textContent = "Seguir mi pedido";

  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Cerrar";
  close.onclick = closeAll;

  panel.append(title, num, info, send, track, close);
  form.insertAdjacentElement("afterend", panel);
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
