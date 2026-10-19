import { parseVehicles, vehiclesLabel, type Vehicle } from "@/lib/courier/vehicle";

// Íconos del vehículo del repartidor (ENVIO-178): SVG de línea, no emoji, que toman el color del texto.
// `motorbike` y `car` de Tabler Icons (https://tabler.io/icons, licencia MIT, © Paweł Kuna), pegados acá y no la
// librería entera. Son los mismos que el seguimiento del cliente (`web/apps/tracker/lib/icons.js`).
function Glyph({ vehicle }: { vehicle: Vehicle }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {vehicle === "moto" ? (
        <>
          <circle cx="5" cy="16" r="3" />
          <circle cx="19" cy="16" r="3" />
          <path d="M7.5 14h5l4 -4h-10.5m1.5 4l4 -4" />
          <path d="M13 6h2l1.5 3l2 4" />
        </>
      ) : (
        <>
          <circle cx="7" cy="17" r="2" />
          <circle cx="17" cy="17" r="2" />
          <path d="M5 17h-2v-6l2 -5h9l4 5h1a2 2 0 0 1 2 2v4h-2m-4 0h-6m-6 -6h15m-6 0v-5" />
        </>
      )}
    </svg>
  );
}

// Uno o los dos íconos juntos, con su texto accesible ("Moto y auto"). Sin vehículos (el interruptor apagado o
// un dato viejo) no pinta nada.
export default function VehicleIcons({ vehicles, className = "" }: { vehicles: unknown; className?: string }) {
  const list = parseVehicles(vehicles);
  if (list.length === 0) return null;

  const label = vehiclesLabel(list);

  return (
    <span role="img" aria-label={label} title={label} className={`inline-flex items-center gap-0.5 align-middle ${className}`}>
      {list.map((vehicle) => (
        <Glyph key={vehicle} vehicle={vehicle} />
      ))}
    </span>
  );
}
