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
// El audio (`assets/pico-frank.mp3`) lo pone el dueño; si falta o el navegador lo bloquea,
// el mapa aparece igual y se cierra solo.
// =====================================================
const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
const CHACO_AUDIO = "assets/pico-frank.mp3";
const CHACO_FALLBACK_MS = 6000;
const CHACO_PATH =
  "M36 9 L122 54 L180 126 L207 153 L198 180 L99 180 L50 180 L14 90 Z";
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
    '<svg class="chaco-egg-map" viewBox="0 0 220 200" role="img" aria-label="Mapa de la provincia del Chaco">' +
    `<path class="chaco-egg-shape" d="${CHACO_PATH}" />` +
    '<circle class="chaco-egg-heart" cx="186" cy="152" r="6" />' +
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

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") return closeChaco();
  const expected = KONAMI[konamiIndex];
  const pressed = event.key.length === 1 ? event.key.toLowerCase() : event.key;
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
