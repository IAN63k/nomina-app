/**
 * Roles y permisos del módulo de Incapacidades (sección "Roles" del
 * requerimiento). Se valida en el servidor; la UI solo lo usa para ocultar
 * botones.
 *
 * Hoy `usuarios.rol` solo tiene "admin". Cualquier valor desconocido cae en
 * "consulta" (solo lectura) para que un rol nuevo nunca obtenga permisos de
 * escritura por accidente.
 */

export type RolIncapacidades = "administrador" | "analista" | "consulta"

export type AccionIncapacidades =
  | "ver"
  | "exportar"
  | "cargar_archivo"
  | "registrar_pago"
  | "registrar_gestion"
  | "editar_seguimiento"
  | "marcar_tipo"
  | "atender_alerta"
  | "anular_pago"
  | "editar_parametros"

const MAPA_ROLES: Record<string, RolIncapacidades> = {
  admin: "administrador",
  administrador: "administrador",
  analista: "analista",
  consulta: "consulta",
}

export function rolIncapacidades(rolUsuario: string | null | undefined): RolIncapacidades {
  return MAPA_ROLES[(rolUsuario ?? "").trim().toLowerCase()] ?? "consulta"
}

const PERMISOS: Record<RolIncapacidades, ReadonlySet<AccionIncapacidades>> = {
  administrador: new Set<AccionIncapacidades>([
    "ver", "exportar", "cargar_archivo", "registrar_pago", "registrar_gestion",
    "editar_seguimiento", "marcar_tipo", "atender_alerta", "anular_pago", "editar_parametros",
  ]),
  analista: new Set<AccionIncapacidades>([
    "ver", "exportar", "cargar_archivo", "registrar_pago", "registrar_gestion",
    "editar_seguimiento", "marcar_tipo", "atender_alerta",
  ]),
  consulta: new Set<AccionIncapacidades>(["ver", "exportar"]),
}

export function puede(rolUsuario: string | null | undefined, accion: AccionIncapacidades): boolean {
  return PERMISOS[rolIncapacidades(rolUsuario)].has(accion)
}
