/**
 * Roles y permisos de los módulos con datos en el servidor (Incapacidades,
 * maestro de Colaboradores y turnos de Recargos). Vaciar o restaurar la tabla
 * completa de turnos es solo del administrador. Se valida en el servidor; la UI solo lo usa para
 * ocultar botones.
 *
 * Hoy `usuarios.rol` solo tiene "admin". Cualquier valor desconocido cae en
 * "consulta" (solo lectura) para que un rol nuevo nunca obtenga permisos de
 * escritura por accidente.
 */

export type Rol = "administrador" | "analista" | "consulta"

export type Accion =
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
  | "ver_colaboradores"
  | "editar_colaboradores"
  | "ver_turnos"
  | "editar_turnos"
  | "vaciar_turnos"

const MAPA_ROLES: Record<string, Rol> = {
  admin: "administrador",
  administrador: "administrador",
  analista: "analista",
  consulta: "consulta",
}

export function rolDe(rolUsuario: string | null | undefined): Rol {
  return MAPA_ROLES[(rolUsuario ?? "").trim().toLowerCase()] ?? "consulta"
}

const PERMISOS: Record<Rol, ReadonlySet<Accion>> = {
  administrador: new Set<Accion>([
    "ver", "exportar", "cargar_archivo", "registrar_pago", "registrar_gestion",
    "editar_seguimiento", "marcar_tipo", "atender_alerta", "anular_pago", "editar_parametros",
    "ver_colaboradores", "editar_colaboradores",
    "ver_turnos", "editar_turnos", "vaciar_turnos",
  ]),
  analista: new Set<Accion>([
    "ver", "exportar", "cargar_archivo", "registrar_pago", "registrar_gestion",
    "editar_seguimiento", "marcar_tipo", "atender_alerta",
    "ver_colaboradores", "editar_colaboradores",
    "ver_turnos", "editar_turnos",
  ]),
  consulta: new Set<Accion>(["ver", "exportar", "ver_colaboradores", "ver_turnos"]),
}

export function puede(rolUsuario: string | null | undefined, accion: Accion): boolean {
  return PERMISOS[rolDe(rolUsuario)].has(accion)
}
