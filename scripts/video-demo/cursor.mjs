// Puntero y círculo de cada toque: Playwright no dibuja el mouse en el video.
// Se inyecta como script de inicio en cada página; se crea recién con el primer movimiento.
export const CURSOR_SCRIPT = `(() => {
  if (window.__demoCursor) return;
  window.__demoCursor = true;
  let pointer = null;
  const make = () => {
    if (pointer || !document.documentElement) return;
    pointer = document.createElement("div");
    pointer.setAttribute("aria-hidden", "true");
    pointer.style.cssText = "position:fixed;left:0;top:0;width:28px;height:28px;z-index:2147483647;pointer-events:none;will-change:transform;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))";
    pointer.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24"><path d="M3 2l7.5 19 2.7-7.8L21 10.5z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(pointer);
  };
  const move = (x, y) => {
    make();
    if (pointer) pointer.style.transform = "translate(" + x + "px," + y + "px)";
  };
  window.addEventListener("mousemove", (e) => move(e.clientX, e.clientY), true);
  window.addEventListener("mousedown", (e) => {
    move(e.clientX, e.clientY);
    if (!document.documentElement) return;
    const ring = document.createElement("div");
    ring.setAttribute("aria-hidden", "true");
    ring.style.cssText = "position:fixed;z-index:2147483646;pointer-events:none;width:44px;height:44px;border-radius:50%;border:3px solid rgba(255,90,40,.95);background:rgba(255,90,40,.22);left:" + (e.clientX - 22) + "px;top:" + (e.clientY - 22) + "px";
    document.documentElement.appendChild(ring);
    const anim = ring.animate(
      [{ transform: "scale(.4)", opacity: 1 }, { transform: "scale(1.5)", opacity: 0 }],
      { duration: 550, easing: "ease-out" },
    );
    anim.onfinish = () => ring.remove();
  }, true);
})();`;
