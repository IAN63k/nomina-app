import { Users } from "lucide-react"

export function HorasExtrasAuxiliaresTab() {
  return (
    <section className="rounded-xl p-6">
      <div className="mb-4 inline-flex items-center gap-2 rounded-full border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
        <Users className="h-3.5 w-3.5" />
        Pestaña Auxiliares
      </div>
      <h2 className="text-lg font-semibold">Horas extras - Auxiliares</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Aquí irá la lógica específica para carga, validación y exportación de horas extras de auxiliares.
      </p>
    </section>
  )
}
