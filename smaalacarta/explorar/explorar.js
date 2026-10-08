import { CATEGORIAS, LOCALES, ZONAS } from "./data.js";

const catPorId = Object.fromEntries(CATEGORIAS.map((c) => [c.id, c]));
const $ = (id) => document.getElementById(id);

const estado = { q: "", cat: null, zona: "", menu: false, fav: false, orden: "dest" };
let favoritos = new Set();
try {
  favoritos = new Set(JSON.parse(localStorage.getItem("explorar:fav") || "[]"));
} catch {
  /* sin almacenamiento: los favoritos duran lo que dure la pestaña */
}

const normalizar = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const escapar = (s) =>
  String(s).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

function guardarFav() {
  try {
    localStorage.setItem("explorar:fav", JSON.stringify([...favoritos]));
  } catch {
    /* ignorado */
  }
}

function aviso(texto) {
  const t = $("toast");
  t.textContent = texto;
  t.hidden = false;
  clearTimeout(aviso.id);
  aviso.id = setTimeout(() => (t.hidden = true), 2600);
}

function filtrar() {
  const q = normalizar(estado.q.trim());
  const lista = LOCALES.filter((l) => {
    if (estado.cat && l.c !== estado.cat) return false;
    if (estado.zona && l.z !== estado.zona) return false;
    if (estado.menu && !l.m) return false;
    if (estado.fav && !favoritos.has(l.n)) return false;
    if (!q) return true;
    const texto = normalizar(
      [l.n, l.a, l.d || "", catPorId[l.c].nombre].join(" "),
    );
    return q.split(/\s+/).every((p) => texto.includes(p));
  });
  const peso = (l) => (l.m ? 2 : 0) + (l.dest ? 1 : 0);
  lista.sort((a, b) =>
    estado.orden === "az" ? a.n.localeCompare(b.n, "es") : peso(b) - peso(a) || a.n.localeCompare(b.n, "es"),
  );
  return lista;
}

function tarjeta(l) {
  const c = catPorId[l.c];
  const fav = favoritos.has(l.n);
  return `<article class="card" data-n="${escapar(l.n)}" tabindex="0" role="button" aria-label="${escapar(l.n)}, ${escapar(c.nombre)}">
    <div class="cover" style="--c:${c.color}"><span>${c.icono}</span>
      <span class="badge ${l.m ? "" : "off"}">${l.m ? "Menú digital" : "Sin menú digital"}</span>
    </div>
    <button class="fav" data-fav="${escapar(l.n)}" aria-pressed="${fav}" aria-label="${fav ? "Quitar de favoritos" : "Guardar en favoritos"}">${fav ? "♥" : "♡"}</button>
    <div class="card-body">
      <h3>${escapar(l.n)}</h3>
      <p class="meta">${escapar(c.nombre)} · ${escapar(l.z)}</p>
      ${l.d ? `<p class="desc">${escapar(l.d)}</p>` : `<p class="meta">${escapar(l.a)}</p>`}
    </div>
  </article>`;
}

function dibujar() {
  const lista = filtrar();
  $("grid").innerHTML = lista.map(tarjeta).join("");
  $("empty").hidden = lista.length > 0;
  $("count").textContent = `${lista.length} ${lista.length === 1 ? "local" : "locales"}`;
  $("results-title").textContent = estado.cat
    ? catPorId[estado.cat].nombre
    : "Todos los locales";

  // El carril de "para pedir" solo aparece sin filtros activos.
  const sinFiltros = !estado.q && !estado.cat && !estado.zona && !estado.menu && !estado.fav;
  $("destacados").hidden = !sinFiltros;
  $("rail").innerHTML = LOCALES.filter((l) => l.m).map(tarjeta).join("");

  document.querySelectorAll(".cat").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.cat === estado.cat)),
  );
  $("f-menu").setAttribute("aria-pressed", String(estado.menu));
  $("f-fav").setAttribute("aria-pressed", String(estado.fav));
}

function abrirDetalle(nombre) {
  const l = LOCALES.find((x) => x.n === nombre);
  if (!l) return;
  const c = catPorId[l.c];
  const tel = l.t
    ? `<li><span>📞</span><a href="tel:+54${l.t.replace(/\D/g, "")}">${escapar(l.t)}</a></li>`
    : "";
  const mapa = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${l.n}, ${l.a}, San Martín de los Andes`)}`;
  const acciones = l.m
    ? `<div class="actions">
         <button class="btn" data-demo="menu">Ver menú y pedir</button>
         <a class="btn ghost" href="${mapa}" target="_blank" rel="noopener">Cómo llegar</a>
       </div>`
    : `<div class="actions">
         <a class="btn ghost" href="${mapa}" target="_blank" rel="noopener">Cómo llegar</a>
       </div>
       <div class="claim">
         <strong>¿Sos el dueño de ${escapar(l.n)}?</strong>
         Sumate con tu menú digital: tus clientes ven la carta y te piden desde acá.
         <a href="https://smaalacarta.com.ar/#contacto">Quiero mi menú →</a>
       </div>`;
  const hoja = $("sheet");
  hoja.innerHTML = `<div class="cover" style="--c:${c.color}"><span>${c.icono}</span></div>
    <button class="sheet-close" aria-label="Cerrar">✕</button>
    <div class="sheet-body">
      <div><p class="meta">${escapar(c.nombre)} · ${escapar(l.z)}</p>
      <h2 id="sheet-title">${escapar(l.n)}</h2></div>
      ${l.d ? `<p>${escapar(l.d)}</p>` : ""}
      <ul class="info">
        <li><span>📍</span><span>${escapar(l.a)}</span></li>
        ${tel}
      </ul>
      ${acciones}
    </div>`;
  hoja.hidden = false;
  $("sheet-bg").hidden = false;
  document.body.style.overflow = "hidden";
  hoja.querySelector(".sheet-close").focus();
}

function cerrarDetalle() {
  $("sheet").hidden = true;
  $("sheet-bg").hidden = true;
  document.body.style.overflow = "";
}

function iniciar() {
  $("cats").innerHTML = CATEGORIAS.map(
    (c) =>
      `<button class="cat" data-cat="${c.id}" aria-pressed="false"><span class="ico" aria-hidden="true">${c.icono}</span>${escapar(c.nombre)}</button>`,
  ).join("");
  $("f-zona").innerHTML =
    `<option value="">Toda la ciudad</option>` +
    ZONAS.map((z) => `<option>${escapar(z)}</option>`).join("");

  $("q").addEventListener("input", (e) => {
    estado.q = e.target.value;
    dibujar();
  });
  $("cats").addEventListener("click", (e) => {
    const b = e.target.closest(".cat");
    if (!b) return;
    estado.cat = estado.cat === b.dataset.cat ? null : b.dataset.cat;
    dibujar();
  });
  $("f-menu").addEventListener("click", () => {
    estado.menu = !estado.menu;
    dibujar();
  });
  $("f-fav").addEventListener("click", () => {
    estado.fav = !estado.fav;
    dibujar();
  });
  $("f-zona").addEventListener("change", (e) => {
    estado.zona = e.target.value;
    dibujar();
  });
  $("f-orden").addEventListener("change", (e) => {
    estado.orden = e.target.value;
    dibujar();
  });
  $("reset").addEventListener("click", () => {
    Object.assign(estado, { q: "", cat: null, zona: "", menu: false, fav: false });
    $("q").value = "";
    $("f-zona").value = "";
    dibujar();
  });

  document.addEventListener("click", (e) => {
    const fav = e.target.closest("[data-fav]");
    if (fav) {
      e.stopPropagation();
      const n = fav.dataset.fav;
      if (favoritos.has(n)) favoritos.delete(n);
      else {
        favoritos.add(n);
        aviso("Guardado en favoritos");
      }
      guardarFav();
      dibujar();
      return;
    }
    if (e.target.closest("[data-demo]")) {
      aviso("En la versión real, acá se abre la carta del local");
      return;
    }
    if (e.target.closest(".sheet-close") || e.target.id === "sheet-bg") {
      cerrarDetalle();
      return;
    }
    const card = e.target.closest(".card");
    if (card) abrirDetalle(card.dataset.n);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") cerrarDetalle();
    if ((e.key === "Enter" || e.key === " ") && e.target.classList?.contains("card")) {
      e.preventDefault();
      abrirDetalle(e.target.dataset.n);
    }
  });

  dibujar();
}

iniciar();
