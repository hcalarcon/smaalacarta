// Íconos SVG de la línea de pasos y del envío (SEGUIMIENTO-25 a 27): inline, sin librerías y armados con
// `createElementNS` (nunca con HTML en texto). La animación es de CSS (`tracker.css`) y se apaga con
// `prefers-reduced-motion`.

const SVG_NS = "http://www.w3.org/2000/svg";

// La moto y el auto son de Tabler Icons (https://tabler.io/icons, licencia MIT, © Paweł Kuna): `motorbike` y `car`,
// con las ruedas como `circle` (la misma geometría que su `path` de círculo). Los dos de la misma librería, y los
// mismos que el panel (`admin/src/components/ui/VehicleIcon.tsx`).
const MOTO = [
  ["circle", { cx: 5, cy: 16, r: 3 }],
  ["circle", { cx: 19, cy: 16, r: 3 }],
  ["path", { d: "M7.5 14h5l4 -4h-10.5m1.5 4l4 -4" }],
  ["path", { d: "M13 6h2l1.5 3l2 4" }],
];

const CAR = [
  ["circle", { cx: 7, cy: 17, r: 2 }],
  ["circle", { cx: 17, cy: 17, r: 2 }],
  ["path", { d: "M5 17h-2v-6l2 -5h9l4 5h1a2 2 0 0 1 2 2v4h-2m-4 0h-6m-6 -6h15m-6 0v-5" }],
];

const BAG = [
  ["path", { d: "M6 8h12l-1 12H7L6 8z" }],
  ["path", { d: "M9 8a3 3 0 0 1 6 0" }],
];

const ICONS = {
  received: [
    ["rect", { x: 5, y: 3, width: 14, height: 18, rx: 2 }],
    ["path", { d: "M9 8h6M9 12h6M9 16h4" }],
  ],
  accepted: [
    ["path", { d: "M3 15h18" }],
    ["path", { d: "M5 15a7 7 0 0 1 14 0" }],
    ["path", { d: "M12 8V6M10 6h4" }],
  ],
  // Una olla con dos hilos de vapor; el vapor sube cuando el paso está activo (`tracker.css`).
  preparing: [
    ["path", { d: "M5 12h14v5a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z" }],
    ["path", { d: "M3 12h18" }],
    ["path", { d: "M9 4c0 1.4 1 1.6 1 3" }],
    ["path", { d: "M14 4c0 1.4 1 1.6 1 3" }],
  ],
  ready: BAG,
  readyPickup: [...BAG, ["path", { d: "M9.5 14.5l2 2 3.5-3.5" }]],
  onTheWay: MOTO,
  delivered: [
    ["path", { d: "M4 11l8-7 8 7v9H4z" }],
    ["path", { d: "M9 15l2 2 4-4" }],
  ],
  pickedUp: [
    ["path", { d: "M5 7h14l-1 13H6L5 7z" }],
    ["path", { d: "M9 14l2 2 4-4" }],
  ],
  cancelled: [
    ["circle", { cx: 12, cy: 12, r: 9 }],
    ["path", { d: "M9 9l6 6M15 9l-6 6" }],
  ],
  searching: MOTO,
  choose: [
    ["path", { d: "M12 3l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.3 6.8 19l1-5.8L3.6 9.1l5.8-.8z" }],
  ],
  self: [
    ["path", { d: "M4 9l1-5h14l1 5" }],
    ["path", { d: "M5 9v11h14V9M9 20v-6h6v6" }],
  ],
  check: [["path", { d: "M5 12.5l4.5 4.5L19 7.5" }]],
  // El vehículo del repartidor (ENVIO-178): la misma moto de la línea de pasos y el auto de Tabler.
  vehicleMoto: MOTO,
  vehicleAuto: CAR,
};

export const ICON_KEYS = Object.keys(ICONS);

// El SVG del ícono `key`, listo para insertar. Una clave desconocida da un SVG vacío (no rompe).
export function icon(doc, key) {
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", `icon icon-${key}`);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");

  for (const [tag, attrs] of ICONS[key] ?? []) {
    const node = doc.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
    svg.appendChild(node);
  }

  return svg;
}
