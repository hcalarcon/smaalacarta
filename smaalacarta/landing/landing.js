const root = document.documentElement;
const body = document.body;
const header = document.querySelector(".header");
const mobileMenuBtn = document.getElementById("mobileMenuBtn");
const nav = document.querySelector(".nav");
const mobileNavOverlay = document.getElementById("mobileNavOverlay");
const navLinks = document.querySelectorAll(".nav-link");
const demosBtn = document.getElementById("demosBtn");
const demosModal = document.getElementById("demosModal");

const prefersReducedMotion = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// =====================================================
// ENCABEZADO: toma fondo al bajar
// =====================================================
function updateHeader() {
  const scrolled = window.scrollY > 50;
  header?.classList.toggle("scrolled", scrolled);
  mobileMenuBtn?.classList.toggle("scrolled", scrolled);
}

window.addEventListener("scroll", updateHeader, { passive: true });
updateHeader();

// =====================================================
// MENÚ DEL CELULAR
// =====================================================
const isMenuOpen = () => nav?.classList.contains("mobile-nav-open") ?? false;

function setMenu(open) {
  nav?.classList.toggle("mobile-nav-open", open);
  mobileMenuBtn?.classList.toggle("mobile-menu-active", open);
  mobileNavOverlay?.classList.toggle("show", open);
  body.classList.toggle("menu-open", open);
  mobileMenuBtn?.setAttribute("aria-expanded", String(open));
  mobileMenuBtn?.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
}

if (mobileMenuBtn && nav) {
  mobileMenuBtn.addEventListener("click", () => setMenu(!isMenuOpen()));
}

mobileNavOverlay?.addEventListener("click", () => setMenu(false));
navLinks.forEach((link) => link.addEventListener("click", () => setMenu(false)));

// =====================================================
// MODAL DE DEMOS
// =====================================================
const isModalOpen = () => demosModal?.classList.contains("show") ?? false;

function focusableInModal() {
  return [...demosModal.querySelectorAll("a[href], button:not([disabled])")];
}

function openDemosModal() {
  if (!demosModal) return;
  demosModal.classList.add("show");
  body.style.overflow = "hidden";
  (demosModal.querySelector(".modal-close") ?? focusableInModal()[0])?.focus();
}

function closeDemosModal() {
  if (!demosModal) return;
  demosModal.classList.remove("show");
  body.style.overflow = "";
  demosBtn?.focus();
}

demosBtn?.addEventListener("click", openDemosModal);
demosModal?.querySelector(".modal-close")?.addEventListener("click", closeDemosModal);

// Tocar afuera del contenido (sobre el fondo oscuro) cierra el modal.
demosModal?.addEventListener("click", (event) => {
  if (event.target === demosModal) closeDemosModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (isModalOpen()) {
      closeDemosModal();
    } else if (isMenuOpen()) {
      setMenu(false);
      mobileMenuBtn?.focus();
    }
    return;
  }

  // Con el modal abierto, Tab da la vuelta adentro en lugar de salir a la página.
  if (event.key === "Tab" && isModalOpen()) {
    const items = focusableInModal();
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];

    if (event.shiftKey && (document.activeElement === first || !demosModal.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !demosModal.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  }
});

// =====================================================
// ANIMACIÓN DE ENTRADA
// El contenido es visible por defecto: el CSS solo lo esconde si este script activa
// `js-reveal`, y no lo hace si el navegador no soporta IntersectionObserver o la persona
// pidió menos movimiento.
// =====================================================
if ("IntersectionObserver" in window && !prefersReducedMotion()) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.1, rootMargin: "0px 0px -50px 0px" },
  );

  root.classList.add("js-reveal");
  document
    .querySelectorAll(".step, .benefit-card, .plan-card, .contact-method")
    .forEach((el) => {
      el.classList.add("reveal");
      observer.observe(el);
    });
}

// =====================================================
// EASTER EGG: código Konami → el mapa del Chaco y Pico Frank
// El audio (`assets/pico-frank.mp3`) es hoy un sonido de prueba propio; el dueño lo reemplaza por el tema; si falta o el navegador lo bloquea,
// el mapa aparece igual y se cierra solo.
// =====================================================
const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
const CHACO_AUDIO = "assets/pico-frank.mp3";
const CHACO_FALLBACK_MS = 6000;
const CHACO_PATH =
  "M200.0 121.8 L195.1 124.1 L195.4 125.8 L193.6 129.5 L192.3 128.6 L191.5 131.9 L189.5 132.3 L188.0 133.7 L188.1 135.5 L190.1 137.6 L190.0 140.8 L187.9 141.4 L178.8 147.9 L178.9 151.1 L181.6 158.4 L179.7 170.8 L66.9 170.9 L66.9 89.2 L66.4 71.5 L65.2 67.9 L0.0 67.8 L42.2 12.4 L42.0 0.0 L54.4 4.2 L59.3 8.7 L64.3 9.7 L67.1 12.1 L69.1 16.0 L72.3 16.1 L73.2 18.1 L77.5 22.2 L86.8 24.0 L89.3 26.6 L91.3 31.1 L90.9 32.7 L92.0 34.1 L93.7 34.2 L103.0 42.1 L109.1 46.0 L114.9 48.0 L117.8 52.8 L120.4 54.7 L120.9 56.9 L123.2 60.0 L125.2 60.5 L125.2 62.7 L127.6 68.0 L129.0 67.8 L133.1 69.4 L134.0 71.1 L135.9 71.6 L139.9 74.7 L140.5 76.9 L143.8 79.3 L146.4 83.1 L147.6 83.4 L148.0 88.6 L157.7 90.9 L159.1 96.1 L160.5 97.8 L163.8 98.0 L168.3 95.8 L170.5 98.2 L176.1 100.6 L179.7 105.0 L191.3 113.4 L195.6 119.4 L198.8 120.0 Z";
let konamiIndex = 0;
let chacoOverlay = null;

function closeChaco() {
  chacoOverlay?.dispatchEvent(new Event("chaco:close"));
}

function openChaco() {
  if (chacoOverlay) return;
  const overlay = document.createElement("div");
  overlay.className = "chaco-egg";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", "La sangre de mi Chaco");
  overlay.innerHTML =
    '<svg class="chaco-egg-map" viewBox="-6 -6 212 183" role="img" aria-label="Mapa de la provincia del Chaco">' +
    `<path class="chaco-egg-shape" d="${CHACO_PATH}" pathLength="1" />` +
    '<circle class="chaco-egg-heart" cx="117.2" cy="117.6" r="5" />' +
    '<text class="chaco-egg-city" x="117.2" y="105">Sáenz Peña</text>' +
    "</svg>" +
    '<p class="chaco-egg-text">La sangre de mi Chaco va corriendo por mis venas</p>';
  document.body.appendChild(overlay);
  chacoOverlay = overlay;

  let audio = null;
  let timer = null;
  const close = () => {
    clearTimeout(timer);
    audio?.pause();
    overlay.remove();
    chacoOverlay = null;
  };
  overlay.addEventListener("chaco:close", close);
  overlay.addEventListener("click", close);

  const fallback = () => {
    clearTimeout(timer);
    timer = setTimeout(close, CHACO_FALLBACK_MS);
  };
  try {
    audio = new Audio(CHACO_AUDIO);
    audio.addEventListener("ended", close);
    audio.addEventListener("error", fallback);
    Promise.resolve(audio.play()).catch(fallback);
  } catch {
    fallback();
  }
}

// Teclas que solo acompañan a otra (Shift para la "B" mayúscula, Bloq Mayús…): no cortan la secuencia.
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "AltGraph", "Meta", "CapsLock", "Fn"]);
const LETTER_CODES = { KeyB: "b", KeyA: "a" };

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") return closeChaco();
  if (event.repeat || MODIFIER_KEYS.has(event.key)) return;
  const expected = KONAMI[konamiIndex];
  // Las letras se toman por posición de tecla, así funciona con cualquier distribución de teclado.
  const pressed = LETTER_CODES[event.code] ?? (event.key.length === 1 ? event.key.toLowerCase() : event.key);
  if (pressed === expected) {
    konamiIndex += 1;
    if (konamiIndex === KONAMI.length) {
      konamiIndex = 0;
      openChaco();
    }
  } else {
    konamiIndex = pressed === KONAMI[0] ? 1 : 0;
  }
});

// En el celular no hay teclado: 7 toques seguidos al logo del encabezado hacen lo mismo.
const LOGO_TAPS = 7;
const LOGO_TAP_GAP_MS = 1500;
let logoTaps = 0;
let logoTapTimer = null;

header?.querySelector(".logo")?.addEventListener("click", () => {
  clearTimeout(logoTapTimer);
  logoTaps += 1;
  if (logoTaps >= LOGO_TAPS) {
    logoTaps = 0;
    openChaco();
    return;
  }
  logoTapTimer = setTimeout(() => (logoTaps = 0), LOGO_TAP_GAP_MS);
});
