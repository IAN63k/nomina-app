import { CalendarDays } from "lucide-react";

import { CartasVacaciones } from "@/components/vacaciones/cartas-vacaciones";

export default function VacacionesPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      <section className="rounded-xl border bg-card p-6 transition-shadow duration-200 hover:shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              Módulo de Vacaciones
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Gestión de Vacaciones</h1>
            <p className="mt-2 text-muted-foreground">
              Genera las cartas de vacaciones combinando una plantilla de Word con la
              programación en Excel. Una carta por empleado, lista para descargar.
            </p>
          </div>
        </div>
      </section>

      <CartasVacaciones />
    </div>
  );
}
