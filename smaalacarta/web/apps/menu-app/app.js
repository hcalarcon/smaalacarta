let cart = [];
let MENU_GLOBAL = null;

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
function resolveAppConfig() {
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
  2. PRODUCCIÓN: DOMINIOS HARDCODEADOS
  ========================================
  */
  const DOMAINS = {
    "moderno.smaalacarta.com.ar": { type: "demo", slug: "moderno" },
    "clasico.smaalacarta.com.ar": { type: "demo", slug: "clasico" },
    "minimal.smaalacarta.com.ar": { type: "demo", slug: "minimal" }, // podés cambiar slug si tenés otro
    "santa-julia-resto.smaalacarta.com.ar": {
      type: "cliente",
      slug: "santa-julia-resto",
    },
  };

  if (DOMAINS[host]) {
    return DOMAINS[host];
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

// INIT
async function init() {
  try {
    const result = resolveAppConfig();
    if (!result) {
      console.error("No se encontró slug en la URL");
      return;
    }

    const { slug, type } = result;

    const basePath = type === "cliente" ? "/data/clientes" : "/data/demos";

    // 1 solo fetch 👇
    const config = await fetchJSON(`${basePath}/${slug}/config.json`);
    if (!config) return;

    const menu = await fetchJSON(`${basePath}/${slug}/menu.json`);
    if (!menu) return;

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
      url("${c.header.imagen}"),
      linear-gradient(
        135deg,
        var(--color-primary, #463AE5),
        var(--color-secondary, #9A6CE0)
      )
    `;
  }

  const abierto = isAbiertoAhora(c);

  if (estadoEl) {
    estadoEl.textContent = abierto ? "Abierto" : "Cerrado";
  }

  if (dot) {
    dot.style.background = abierto ? "#4ade80" : "#ef4444";
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

  // 💸 Ofertas
  if (ofertas.length > 0) {
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
      <h2 class="categoria-titulo">${cat.nombre}</h2>
      <div class="categoria-grid"></div>
    `;

    const grid = sec.querySelector(".categoria-grid");

    (cat.items || []).forEach((p) => {
      const d = document.createElement("div");
      d.className = "producto";

      if (p.promo) {
        d.setAttribute("data-promo", p.promo);
      }

      d.innerHTML = `
        ${p.imagen ? `<img src="${p.imagen}">` : ""}
        <div class="producto-info">
          <h3>${p.nombre}</h3>
          <p>${p.descripcion || ""}</p>
          ${p.precioAnterior ? `<span class="precio-anterior">$${p.precioAnterior}</span>` : ""}
          <div class="producto-precio">$${p.precio}</div>
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

  const existente = cart.find((i) => i.nombre === p.nombre);

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
        <h4>${i.nombre || ""}</h4>
        <span class="item-precio">$${i.precio}</span>
      </div>
      <div class="item-controls">
        <button class="btn-minus"><svg width="16" height="16" viewBox="0 0 24 24">
  <path d="M5 12h14" stroke="currentColor" stroke-width="2"/>
</svg></button>
        <span class="item-cantidad">${i.cantidad}</span>
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
$("#form-pedido")?.addEventListener("submit", (e) => {
  e.preventDefault();

  const f = new FormData(e.target);

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

  window.open(
    `https://api.whatsapp.com/send?phone=${CONFIG.telefono}&text=${encodeURIComponent(msg)}`,
  );

  cart = [];
  saveCart();
  updateCart();
  closeAll();
});

// INIT
init();

// DESHABILITAR HORA SI "AHORA MISMO"
$('input[name="ahora"]')?.addEventListener("change", (e) => {
  const timeInput = $('input[name="horario"]');
  if (!timeInput) return;

  timeInput.disabled = e.target.checked;
  if (e.target.checked) timeInput.value = "";
});
