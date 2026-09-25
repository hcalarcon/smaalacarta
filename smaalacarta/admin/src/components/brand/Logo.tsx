type LogoProps = {
  tone?: "dark" | "light";
  // Solo el ícono, para espacios angostos.
  compact?: boolean;
};

export default function Logo({ tone = "dark", compact = false }: LogoProps) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-xl shadow-sm"
      >
        🍽️
      </span>

      {compact ? null : (
        <span
          className={`text-lg font-semibold ${
            tone === "light" ? "text-white" : "text-brand"
          }`}
        >
          SMA a la Carta
        </span>
      )}
    </div>
  );
}
