import { Stethoscope } from "lucide-react"

export function HorasExtrasMedicosTab() {
  return (
    <section className="rounded-xl p-6">
      <div className="mb-4 inline-flex items-center gap-2 rounded-full border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
        <Stethoscope className="h-3.5 w-3.5" />
        Pestaña Médicos
      </div>
      <h2 className="text-lg font-semibold">Horas extras - Médicos</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Aquí irá la lógica específica para carga, validación y exportación de horas extras de médicos.
      </p>
    </section>
  )
}
