let cart = [];
let MENU_GLOBAL = null;

function fetchJSON(path) {
  return fetch(path)
    .then((res) => {
      if (!res.ok) {
        console.error("Error HTTP:", res.status, path);
        return null;
      }
      return res.json();
    })
    .catch((err) => {
      console.error("Error fetch:", err, path);
      return null;
    });
}

function getSlug() {
  const params = new URLSearchParams(window.location.search);
  return params.get("demo") || params.get("cliente") || null;
}

// INIT
async function init() {
  const slug = getSlug();

  const config =
    (await fetchJSON(`./data/clientes/${slug}/config.json`)) ||
    (await fetchJSON(`./data/demos/${slug}/config.json`));

  if (!config) return;

  window.CONFIG = config;

  // Aplicar colores desde config si existen
  if (config.colores) {
    const root = document.documentElement;
    if (config.colores.primary) {
      root.style.setProperty("--color-primary", config.colores.primary);
    }
    if (config.colores.secondary) {
      root.style.setProperty("--color-secondary", config.colores.secondary);
    }
  }

  loadTemplate(config.template);

  const menu =
    (await fetchJSON(`data/clientes/${slug}/menu.json`)) ||
    (await fetchJSON(`data/demos/${slug}/menu.json`));

  if (!menu) return;

  renderHeader(config);
  renderCategorias(menu);
  MENU_GLOBAL = menu;
  renderMenu(menu);
  initSearch();

  loadCart();

  document.body.classList.remove("loading");
  const loader = document.getElementById("loader");
  if (loader) loader.style.display = "none";
}

function loadTemplate(template) {
  return new Promise((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `templates/${template}/styles.css`;

    link.onload = () => resolve(); // 👈 CLAVE
    document.head.appendChild(link);
  });
}

// RENDER
function renderHeader(c) {
  document.getElementById("nombre-negocio").textContent = c.nombre;
  document.getElementById("descripcion-negocio").textContent = c.descripcion;

  const header = document.querySelector(".header");

  if (c.header?.imagen) {
    header.style.backgroundImage = `
      url("${c.header.imagen}"),
      linear-gradient(
        135deg,
        var(--color-primary, #463AE5),
        var(--color-secondary, #9A6CE0)
      )
    `;
  }

  // Actualizar estado (abierto/cerrado)
  //   const estadoElement = document.getElementById("estado-texto");
  //   if (estadoElement && c.abierto !== undefined) {
  //     estadoElement.textContent = c.abierto ? "Abierto" : "Cerrado";
  //     const dot = document.querySelector(".badge-estado .dot");
  //     if (dot) {
  //       dot.style.background = c.abierto ? "#4ade80" : "#ef4444";
  //     }
  //   }

  const abierto = isAbiertoAhora(c);

  const estadoElement = document.getElementById("estado-texto");
  if (estadoElement) {
    estadoElement.textContent = abierto ? "Abierto" : "Cerrado";

    const dot = document.querySelector(".badge-estado .dot");
    if (dot) {
      dot.style.background = abierto ? "#4ade80" : "#ef4444";
    }
  }
}

function isAbiertoAhora(config) {
  if (!config.horarios) return true;

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
    const [inicio, fin] = rango.split("-");

    const [h1, m1] = inicio.split(":").map(Number);
    const [h2, m2] = fin.split(":").map(Number);

    const inicioMin = h1 * 60 + m1;
    let finMin = h2 * 60 + m2;

    // 🔥 maneja horarios que pasan medianoche (ej: 20:00 - 02:00)
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

function renderMenu(menu) {
  const menuContainer = document.getElementById("menu");
  menuContainer.innerHTML = "";

  menu.categorias.forEach((cat) => {
    const sec = document.createElement("div");
    sec.className = "categoria";

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

      d.querySelector(".btn-add").onclick = () => addToCart(p);

      grid.appendChild(d); // 👈 clave
    });

    menuContainer.appendChild(sec);
  });
}

function initSearch() {
  const input = document.getElementById("buscador");
  if (!input) return;

  input.oninput = (e) => {
    const term = (e.target.value || "").trim().toLowerCase();

    if (!MENU_GLOBAL || !MENU_GLOBAL.categorias) return;

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

          // Incluir toda la categoría si coincide el nombre, o los productos filtrados
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
      const menuContainer = document.getElementById("menu");
      menuContainer.innerHTML =
        '<div class="no-results">No se encontraron productos o categorías.</div>';
    } else {
      renderMenu(filtrado);
    }
  };
}

// CARRITO
function addToCart(p) {
  console.log("Agregando al carrito:", p);
  const e = cart.find((i) => i.nombre === p.nombre);
  if (e) {
    e.cantidad++;
    console.log("Incrementando cantidad:", e);
  } else {
    cart.push({ ...p, cantidad: 1 });
    console.log("Agregando nuevo item:", p);
  }
  saveCart();
  updateCart();
}

function updateCart() {
  const itemsContainer = document.getElementById("carrito-items");
  itemsContainer.innerHTML = "";
  let total = 0,
    count = 0;

  cart.forEach((i, idx) => {
    total += i.precio * i.cantidad;
    count += i.cantidad;

    const d = document.createElement("div");
    d.className = "carrito-item";

    d.innerHTML = `
      <div class="item-info">
        <h4>${i.nombre}</h4>
        <span class="item-precio">$${i.precio}</span>
      </div>
      <div class="item-controls">
        <button class="btn-minus">-</button>
        <span class="item-cantidad">${i.cantidad}</span>
        <button class="btn-plus">+</button>
        <button class="btn-remove">🗑️</button>
      </div>
    `;

    // Eventos
    d.querySelector(".btn-minus").onclick = () => {
      if (i.cantidad > 1) i.cantidad--;
      else cart.splice(idx, 1);
      updateCart();
    };
    d.querySelector(".btn-plus").onclick = () => {
      i.cantidad++;
      updateCart();
    };
    d.querySelector(".btn-remove").onclick = () => {
      cart.splice(idx, 1);
      updateCart();
    };

    itemsContainer.appendChild(d);
  });

  document.getElementById("carrito-total").textContent = `$${total}`;
  document.getElementById("carrito-count").textContent = count;
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

// UI
document.getElementById("btn-carrito").onclick = () => {
  document.getElementById("carrito-panel").classList.add("active");
  document.getElementById("overlay").classList.add("active");
  document.body.classList.add("no-scroll");
};
document.getElementById("cerrar-carrito").onclick = closeAll;
document.getElementById("overlay").onclick = closeAll;

function closeAll() {
  document.getElementById("carrito-panel").classList.remove("active");
  document.getElementById("overlay").classList.remove("active");
  document.getElementById("checkout").classList.remove("active");
  document.body.classList.remove("no-scroll");
}

document.getElementById("btn-finalizar").onclick = () => {
  document.getElementById("carrito-panel").classList.remove("active");
  document.getElementById("overlay").classList.remove("active");
  document.getElementById("checkout").classList.add("active");
};
document.getElementById("cerrar-checkout").onclick = closeAll;

// WHATSAPP
document.getElementById("form-pedido").onsubmit = (e) => {
  e.preventDefault();
  const f = new FormData(e.target);

  let msg = `Pedido de ${f.get("nombre")} ${f.get("apellido")}\n`;
  msg += `Entrega: ${f.get("entrega")}\n`;

  const ahora = f.get("ahora");
  const horario = f.get("horario");
  if (ahora) {
    msg += `Horario: Ahora mismo\n`;
  } else if (horario) {
    msg += `Horario: ${horario}\n`;
  }

  msg += `Pago: ${f.get("pago")}\n`;

  const notas = f.get("notas");
  if (notas) msg += `Notas: ${notas}\n`;

  msg += `\nProductos:\n`;
  cart.forEach((i) => (msg += `${i.nombre} x${i.cantidad}\n`));

  window.open(
    `https://wa.me/${CONFIG.telefono}?text=${encodeURIComponent(msg)}`,
  );

  cart = [];
  saveCart();
  updateCart();
  closeAll();
};

init();

// DESHABILITAR HORA SI "AHORA MISMO"
document
  .querySelector('input[name="ahora"]')
  .addEventListener("change", (e) => {
    const timeInput = document.querySelector('input[name="horario"]');
    timeInput.disabled = e.target.checked;
    if (e.target.checked) timeInput.value = "";
  });
