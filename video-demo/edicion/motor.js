// Vuelca en una timeline de GSAP el guion que arma scripts/video-demo/*.mjs.
// Cada paso: { s: selector, t: segundo, d: duración, de: valores de salida, a: valores de llegada, e: easing }.
// Sin `d` es un `set`. Todo con valores explícitos, para que el render no dependa del orden de búsqueda.
window.montarGuion = function (tl, guion) {
  for (const g of guion) {
    if (!g.d) {
      tl.set(g.s, g.a, g.t);
      continue;
    }
    const fin = Object.assign({}, g.a, { duration: g.d, ease: g.e || "power2.inOut", immediateRender: false });
    if (g.escalonado) fin.stagger = g.escalonado;
    if (g.de) tl.fromTo(g.s, g.de, fin, g.t);
    else tl.to(g.s, fin, g.t);
  }
};
