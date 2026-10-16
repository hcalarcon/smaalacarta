import { parseVehicles, vehiclesLabel, type Vehicle } from "@/lib/courier/vehicle";

// Íconos propios del vehículo del repartidor (ENVIO-178): SVG de línea, no emoji, que toman el color del texto.
// Es la misma moto que el seguimiento del cliente; el auto es de la misma familia.
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
          <circle cx="6" cy="17" r="3" />
          <circle cx="18" cy="17" r="3" />
          <path d="M9 17h5l3-7h-4M13 10l-1.5-3H8" />
        </>
      ) : (
        <>
          <path d="M5 11l1.6-4.2A2 2 0 0 1 8.5 5.5h7a2 2 0 0 1 1.9 1.3L19 11" />
          <path d="M4 11h16a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z" />
          <circle cx="7.5" cy="17.5" r="1.6" />
          <circle cx="16.5" cy="17.5" r="1.6" />
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
