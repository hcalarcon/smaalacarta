// Foto del producto ampliada (ESTATICO-9). Script suelto, sin módulos: lo cargan el menú
// interactivo y el estático. Delegación de eventos, así sirve para tarjetas que se
// dibujan después. La foto se asigna por propiedad (nunca como HTML).
(function () {
  let overlay = null;

  function close() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    document.removeEventListener("keydown", onKey);
  }

  function onKey(e) {
    if (e.key === "Escape") close();
  }

  function open(src) {
    close();

    overlay = document.createElement("div");
    overlay.className = "lightbox";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");

    const img = document.createElement("img");
    img.src = src;
    img.alt = "";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lightbox-cerrar";
    btn.setAttribute("aria-label", "Cerrar");
    btn.textContent = "✕";

    overlay.append(img, btn);
    // Tocar el fondo o la ✕ cierra; tocar la foto, no.
    overlay.addEventListener("click", (e) => {
      if (e.target !== img) close();
    });

    document.body.appendChild(overlay);
    document.addEventListener("keydown", onKey);
    btn.focus();
  }

  document.addEventListener("click", (e) => {
    const img = e.target instanceof Element ? e.target.closest(".producto > img") : null;
    if (img && img.src) open(img.src);
  });
})();
