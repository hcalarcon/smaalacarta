export default function DashboardHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="flex items-center justify-between px-4 py-4 md:px-6 lg:px-8">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Don Emilio</h2>

          <p className="text-sm text-slate-500">Administración del negocio</p>
        </div>

        <button className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90">
          Ver web
        </button>
      </div>
    </header>
  );
}
