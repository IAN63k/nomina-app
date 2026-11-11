/**
 * Siembra el proyecto Supabase DEMO con datos 100 % ficticios.
 *
 *   npm run demo:sembrar                       # simulacro: solo cuenta lo que generaría
 *   npm run demo:sembrar -- --sql salida.sql   # escribe el SQL (vaciar + insertar)
 *   npm run demo:sembrar -- --aplicar          # vacía y llena la BD demo, y evalúa alertas
 *   npm run demo:sembrar -- --archivos public/demo   # Excel de ejemplo (KactuS y vacaciones)
 *
 * --aplicar usa DEMO_SUPABASE_URL y DEMO_SUPABASE_SERVICE_ROLE_KEY (de .env)
 * y se niega a correr si apuntan al proyecto real. Reejecutarlo deja la demo como
 * nueva (útil justo antes de una presentación).
 *
 * Nombres, cédulas (1234500001…) y Nº de incapacidad (9000000001…) son inventados.
 * Los turnos se calculan con el motor real (recargoEngine), así que recargos y
 * horas extra salen igual que en la app.
 */

import fs from "node:fs"
import path from "node:path"
import * as XLSX from "xlsx"
import { createClient } from "@supabase/supabase-js"
import { buildTurnoRows, DAY_LABELS, type TurnosByCode, type TurnoRow } from "@/src/services/recargoEngine"
import { AUX_DEFAULT_TURNOS } from "@/src/constants/auxiliaresShifts"
import { DEFAULT_RECARGO_CONFIG } from "@/src/types/recargo"
import type { DayHeader, MonthSchedule } from "@/src/types/schedule"
import { evaluarYRegistrar } from "@/src/lib/incapacidadesDb"

// ── Utilidades ───────────────────────────────────────────────────────────────

/** PRNG determinista: la demo sale igual cada vez. */
function prng(semilla: number) {
  let s = semilla >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const azar = prng(20261110)
const entre = (a: number, b: number) => a + Math.floor(azar() * (b - a + 1))
const uno = <T>(xs: readonly T[]): T => xs[Math.floor(azar() * xs.length)]

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const fecha = (s: string) => {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(y, m - 1, d)
}
const sumarDias = (s: string, n: number) => {
  const d = fecha(s)
  d.setDate(d.getDate() + n)
  return iso(d)
}

// ── Colaboradores ficticios ──────────────────────────────────────────────────

const NOMBRES = ["Andrea", "Camilo", "Daniela", "Esteban", "Fernanda", "Gabriel", "Helena", "Iván", "Juliana", "Kevin",
  "Laura", "Mateo", "Natalia", "Óscar", "Paula", "Ricardo", "Sara", "Tomás", "Valeria", "Wilson"]
const APELLIDOS = ["Arango", "Bermúdez", "Cifuentes", "Dávila", "Echeverri", "Franco", "Galeano", "Henao", "Isaza",
  "Jaramillo", "Londoño", "Montoya", "Nieto", "Ospina", "Pardo", "Quintero", "Restrepo", "Salazar", "Tobón", "Uribe"]
const SEDES = ["Sede Norte", "Sede Centro", "Sede Sur"]
const FONDOS = ["Colpensiones", "Porvenir", "Protección", "Colfondos", "Skandia"]
const EPS = ["SOS", "Sanitas", "Sura", "Nueva EPS", "Salud Total", "Compensar"]

interface Colaborador {
  identificacion: string
  nombre: string
  nombres: string
  apellidos: string
  cargo: string
  sede: string
  fondo_pensiones: string | null
  salario: number
  eps: string
}

function crearColaboradores(): Colaborador[] {
  const cargos = [
    ...Array(8).fill("Médico general"),
    ...Array(10).fill("Auxiliar de enfermería"),
    ...Array(4).fill("Enfermera jefe"),
    ...Array(4).fill("Analista administrativo"),
    ...Array(4).fill("Técnico de laboratorio"),
  ]
  return cargos.map((cargo, i) => {
    // Combinación única: apellidos desplazados + nombre, para no repetir.
    const apellidos = `${APELLIDOS[i % 20]} ${APELLIDOS[(i * 7 + 3) % 20]}`.toUpperCase()
    const nombres = NOMBRES[(i * 3 + Math.floor(i / 20)) % 20].toUpperCase()
    return {
    identificacion: `12345${String(i + 1).padStart(5, "0")}`,
    nombre: `${apellidos} ${nombres}`,
    nombres,
    apellidos,
    cargo,
    sede: SEDES[i % 3],
    fondo_pensiones: i % 9 === 4 ? null : FONDOS[i % 5],
    salario: cargo === "Médico general" ? 7_200_000 : cargo === "Enfermera jefe" ? 4_800_000 : cargo === "Auxiliar de enfermería" ? 2_100_000 : 2_900_000,
    eps: EPS[i % EPS.length],
  }})
}

// ── Incapacidades ────────────────────────────────────────────────────────────

interface FilaInc {
  identificacion: string; nro_incapacidad: string; nombre: string; concepto: number | null; tipo: string
  es_prorroga: boolean; dias: number; dias_acumulados: number; fecha_desde: string; fecha_hasta: string
  fecha_radicacion_nomina: string | null; fecha_radicacion_eps: string | null; valor_incapacidad: number
  eps: string; entidad_kactus: string; valor_fondo_manual: null; estado: string; causal_no_pago: string | null
  responsable: string | null; observacion: string | null; fin_lactancia: string | null; sugerido_transito: boolean
  para_revisar: string[]; origen: string
}
interface FilaPago { identificacion: string; nro_incapacidad: string; tramo: "eps" | "fondo"; fecha_pago: string; valor: number; observacion: string | null }
interface FilaGestion { identificacion: string; nro_incapacidad: string; fecha: string; tipo: string; accion: string }

const CONCEPTO: Record<string, number | null> = {
  "Enfermedad general": 121, "Licencia de maternidad": 122, "Licencia de paternidad": 123,
  "Accidente de trabajo": 124, "Accidente de tránsito": 121, "Enfermedad laboral": 124,
}

function crearIncapacidades(cols: Colaborador[], hoy: string) {
  const incs: FilaInc[] = []
  const pagos: FilaPago[] = []
  const gestiones: FilaGestion[] = []
  let nro = 9000000001

  const agregar = (c: Colaborador, tipo: string, desde: string, dias: number, acumulados: number, prorroga: boolean, extra: Partial<FilaInc> = {}) => {
    const hasta = sumarDias(desde, dias - 1)
    // Enfermedad general: 66,67 % del salario diario desde el día 3 (simplificado para la demo).
    const pct = tipo === "Enfermedad general" || tipo === "Accidente de tránsito" ? 0.6667 : 1
    const valor = Math.round((c.salario / 30) * dias * pct / 100) * 100
    const eps = tipo === "Accidente de trabajo" || tipo === "Enfermedad laboral" ? "Colmena ARL" : c.eps
    const radNomina = sumarDias(hasta, entre(1, 6))
    const fila: FilaInc = {
      identificacion: c.identificacion, nro_incapacidad: String(nro++), nombre: c.nombre, concepto: CONCEPTO[tipo],
      tipo, es_prorroga: prorroga, dias, dias_acumulados: acumulados, fecha_desde: desde, fecha_hasta: hasta,
      fecha_radicacion_nomina: radNomina <= hoy ? radNomina : null,
      fecha_radicacion_eps: radNomina <= hoy ? sumarDias(radNomina, entre(2, 10)) : null,
      valor_incapacidad: valor, eps, entidad_kactus: `${eps.toUpperCase()} (DEMO)`, valor_fondo_manual: null,
      estado: "Radicada", causal_no_pago: null, responsable: "Equipo nómina", observacion: "Dato ficticio de demostración",
      fin_lactancia: null, sugerido_transito: false, para_revisar: [], origen: "demo", ...extra,
    }
    incs.push(fila)
    return fila
  }
  const pagar = (f: FilaInc, fraccion: number, tramo: "eps" | "fondo" = "eps") => {
    if (!f.fecha_radicacion_eps) return
    const fechaPago = sumarDias(f.fecha_radicacion_eps, entre(20, 75))
    if (fechaPago > hoy) return
    pagos.push({ identificacion: f.identificacion, nro_incapacidad: f.nro_incapacidad, tramo, fecha_pago: fechaPago,
      valor: Math.round(f.valor_incapacidad * fraccion / 100) * 100, observacion: "Pago ficticio" })
    f.estado = fraccion >= 1 ? "Pagada" : "Pagada parcial"
  }
  const gestionar = (f: FilaInc, tipo: string, accion: string, dias = 30) => {
    const base = f.fecha_radicacion_eps ?? f.fecha_hasta
    const d = sumarDias(base, dias)
    if (d <= hoy) gestiones.push({ identificacion: f.identificacion, nro_incapacidad: f.nro_incapacidad, fecha: d, tipo, accion })
  }

  // 1) Cadena larga de prórrogas que pasa el día 180 → alertas 90/120/150/180 y cobro al fondo.
  {
    const c = cols[18]
    let desde = "2026-03-02", acum = 0
    for (const dias of [30, 30, 30, 30, 30, 30, 20, 15]) {
      acum += dias
      const f = agregar(c, "Enfermedad general", desde, dias, acum, acum > dias)
      if (acum <= 120) pagar(f, 1)
      desde = sumarDias(f.fecha_hasta, 1)
    }
  }
  // 2) Cadena que va por ~100 días (hito 90 y alerta previa de 120).
  {
    const c = cols[9]
    let desde = sumarDias(hoy, -100), acum = 0
    for (const dias of [30, 30, 30, 15]) {
      acum += dias
      const f = agregar(c, "Enfermedad general", desde, dias, acum, acum > dias)
      if (acum === 30) pagar(f, 1)
      desde = sumarDias(f.fecha_hasta, 1)
    }
  }
  // 3) Licencia de maternidad con fin de lactancia, y una de paternidad.
  {
    const f = agregar(cols[11], "Licencia de maternidad", "2026-06-15", 126, 126, false)
    f.fin_lactancia = sumarDias(f.fecha_hasta, 183)
    pagar(f, 1)
    pagar(agregar(cols[1], "Licencia de paternidad", "2026-08-03", 14, 14, false), 1)
  }
  // 4) Accidentes de tránsito (vista propia) y uno de trabajo.
  {
    const f = agregar(cols[13], "Accidente de tránsito", "2026-05-11", 45, 45, false, { sugerido_transito: true })
    gestionar(f, "Correo", "Se solicita a la aseguradora SOAT (ficticia) el pago de los primeros 180 días.")
    agregar(cols[22], "Accidente de tránsito", sumarDias(hoy, -40), 30, 30, false, { sugerido_transito: true })
    pagar(agregar(cols[26], "Accidente de trabajo", "2026-07-06", 12, 12, false), 1)
  }
  // 5) Una rechazada con causal y otra prescrita, para mostrar la cartera difícil.
  {
    const r = agregar(cols[5], "Enfermedad general", "2026-02-09", 8, 8, false, {
      estado: "Rechazada", causal_no_pago: "IPS no adscrita a la red" })
    gestionar(r, "Reclamación", "Se radica reclamación ante la EPS con soporte de urgencias.", 15)
    agregar(cols[7], "Enfermedad general", "2023-06-05", 5, 5, false, { estado: "Prescrita" })
  }
  // 6) Incapacidades cortas sueltas durante el año, con estados variados.
  for (let i = 0; i < 44; i++) {
    const c = cols[entre(0, cols.length - 1)]
    const desde = sumarDias("2026-01-05", entre(0, Math.max(0, Math.round((fecha(hoy).getTime() - fecha("2026-01-05").getTime()) / 864e5) - 10)))
    const dias = uno([2, 3, 3, 4, 5, 7, 10, 15])
    const f = agregar(c, uno(["Enfermedad general", "Enfermedad general", "Enfermedad general", "Enfermedad laboral"]), desde, dias, dias, false)
    const suerte = azar()
    if (suerte < 0.45) pagar(f, 1)
    else if (suerte < 0.6) pagar(f, 0.5)
    else if (suerte < 0.75) { f.estado = "En trámite"; gestionar(f, "Llamada", "Se llama a la EPS: informan que está en auditoría.") }
    else if (suerte < 0.8) { f.estado = "Sin subsidio"; f.causal_no_pago = "No cumple mínimo de semanas de cotización" }
  }

  return { incs, pagos, gestiones }
}

// ── Turnos (Recargos) ────────────────────────────────────────────────────────

const MEDICOS_TURNOS: TurnosByCode = {
  M: { entrada: "06:00", salida: "13:00", total: "7" },
  T: { entrada: "13:00", salida: "20:00", total: "7" },
  N: { entrada: "20:00", salida: "06:00", total: "9" },
  L: { entrada: "", salida: "", total: "0" },
  A: { entrada: "", salida: "", total: "0" },
}
const AUX_TURNOS: TurnosByCode = Object.fromEntries(
  Object.entries(AUX_DEFAULT_TURNOS).map(([k, v]) => [k, { entrada: v.entrada, salida: v.salida, total: v.total }]),
)

const MESES = [
  { label: "Octubre 2026", anio: 2026, mes: 10 },
  { label: "Noviembre 2026", anio: 2026, mes: 11 },
]

function diasDelMes(anio: number, mes: number): DayHeader[] {
  const n = new Date(anio, mes, 0).getDate()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(anio, mes - 1, i + 1)
    return { dayNumber: i + 1, dayLabel: DAY_LABELS[d.getDay()], isSunday: d.getDay() === 0, isWeeklyTotal: false }
  })
}

/** Rotación de 4 días desplazada por persona; algunos libres se cambian por un turno extra. */
function programar(nombres: string[], patron: string[], turnos: TurnosByCode, extras: string[], ausencia: string): MonthSchedule[] {
  return MESES.map(({ label, anio, mes }) => {
    const days = diasDelMes(anio, mes)
    const doctors = nombres.map((name, p) => {
      const shifts: MonthSchedule["doctors"][number]["shifts"] = {}
      for (const day of days) {
        const idx = (day.dayNumber + p + mes) % patron.length
        let code = patron[idx]
        if (code === "L" && azar() < 0.3) code = uno(extras) // doblan turno → horas extra
        if (azar() < 0.015) code = ausencia
        shifts[day.dayNumber] = { code, hours: Number(turnos[code]?.total ?? 0) }
      }
      return { name, shifts, weeklyTotals: [], monthTotal: 0 }
    })
    return { month: label, days, doctors }
  })
}

const aFilaBd = (r: TurnoRow, conFestivo: boolean) => ({
  medico: r.medico, documento: r.documento, fecha: r.fecha, fecha_inicio: r.fechaInicio, turno_codigo: r.turno_codigo,
  entrada: r.entrada, salida: r.salida, concepto: r.concepto, horas: r.horas, horasrecargo: r.horasrecargo,
  diferencia: r.diferencia, dia: r.dia, mes: r.mes, dia_numero: r.dia_numero,
  ...(conFestivo ? { festivo: Boolean(r.festivo) } : {}),
})

function crearTurnos(cols: Colaborador[]) {
  const medicos = cols.filter((c) => c.cargo === "Médico general").map((c) => c.nombre)
  const auxiliares = cols.filter((c) => c.cargo === "Auxiliar de enfermería").map((c) => c.nombre)
  const filasMed = buildTurnoRows(
    programar(medicos, ["M", "T", "N", "L", "M", "T"], MEDICOS_TURNOS, ["M", "T"], "A"),
    { turnosByCode: MEDICOS_TURNOS, recargoConfig: DEFAULT_RECARGO_CONFIG },
  ).map((r) => aFilaBd(r, false))
  const filasAux = buildTurnoRows(
    programar(auxiliares, ["M1", "T1", "N1", "L", "M2", "T3", "N2", "L"], AUX_TURNOS, ["M1", "T2"], "INCAP"),
    { turnosByCode: AUX_TURNOS, recargoConfig: DEFAULT_RECARGO_CONFIG, isFestivo: (c) => Boolean(c?.festivo) },
  ).map((r) => aFilaBd(r, true))
  return { filasMed, filasAux }
}

// ── Archivos de ejemplo para las cargas ─────────────────────────────────────

function escribirArchivos(dir: string, cols: Colaborador[], incs: FilaInc[], hoy: string) {
  fs.mkdirSync(dir, { recursive: true })
  const libro = (hojas: Record<string, Record<string, unknown>[]>, archivo: string) => {
    const wb = XLSX.utils.book_new()
    for (const [nombre, filas] of Object.entries(hojas)) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas, { cellDates: true }), nombre)
    fs.writeFileSync(path.join(dir, archivo), XLSX.write(wb, { type: "buffer", bookType: "xlsx" }))
    console.log(`Archivo: ${path.join(dir, archivo)}`)
  }

  // KactuS: 8 incapacidades nuevas (Nº 9000000101…) + 1 que ya está en la demo → se ve como duplicada.
  const kactus: Record<string, unknown>[] = []
  const fila = (c: Colaborador, nro: string, desde: string, dias: number, tipo: [number, string], diag: string, extra: Record<string, unknown> = {}) => ({
    "Identificación": c.identificacion, "Nombres": c.nombres, "Apellidos": c.apellidos, "Nro. Incapacidad": nro,
    "Concepto": tipo[0], "Nombre Concepto": tipo[1], "Nro. Incapacidad Prorrogada": "", "Número Días": dias,
    "Días Totales": dias, "Fecha Desde": fecha(desde), "Fecha Hasta": fecha(sumarDias(desde, dias - 1)),
    "Fecha Radicación": fecha(sumarDias(desde, dias + 2)), "Valor incapacidad": Math.round((c.salario / 30) * dias * 0.6667 / 100) * 100,
    "Nombre Entidad": `${c.eps} EPS`, "Diagnóstico": diag, "Fecha Final de Lactancia": "", "Observaciones": "Archivo de ejemplo (ficticio)",
    ...extra,
  })
  const EG: [number, string] = [121, "INCAPACIDAD ENFERMEDAD GENERAL"]
  for (let i = 0; i < 8; i++) {
    const c = cols[(i * 4 + 2) % cols.length]
    kactus.push(fila(c, String(9000000101 + i), sumarDias(hoy, -entre(10, 40)), uno([2, 3, 5, 8]), EG, i === 3 ? "S82.2 FRACTURA DE TIBIA (DEMO)" : "J06.9 INFECCION RESPIRATORIA (DEMO)"))
  }
  const ya = incs.find((f) => f.tipo === "Licencia de paternidad")!
  const colYa = cols.find((c) => c.identificacion === ya.identificacion)!
  kactus.push(fila(colYa, ya.nro_incapacidad, ya.fecha_desde, ya.dias, [123, "LICENCIA DE PATERNIDAD"], "Z39.2"))
  libro({ KNmIncap: kactus }, "kactus_demo.xlsx")

  // Vacaciones: hoja PROGRAMACION + hoja de períodos acumulados (VAC ANUAL).
  const elegidos = cols.filter((_, i) => i % 3 === 0)
  const salida = sumarDias(hoy, 20)
  const programacion = elegidos.map((c, i) => {
    const toma = uno([6, 10, 15])
    return {
      NOMBRE: c.nombres, APELLIDO: c.apellidos, CEDULA: Number(c.identificacion), CARGO: c.cargo, SEDE: c.sede,
      "PERIODO 1": fecha("2025-02-01"), "PERIODO 2": fecha("2026-01-31"), DIAS_TIENE: 15, DIAS_TOMA: toma,
      COMPENSADAS: i % 4 === 0 ? 3 : 0, SALIDA: fecha(salida), HASTA: fecha(sumarDias(salida, toma + 3)),
      REINTEGRO: fecha(sumarDias(salida, toma + 4)),
    }
  })
  const acumulados = elegidos.flatMap((c, i) => [
    { "Id. Empleado": Number(c.identificacion), "Fecha Inicial": fecha("2024-02-01"), "Fecha Final": fecha("2025-01-31"), "Acumulado Dias": i % 2 ? 5 : 0 },
    { "Id. Empleado": Number(c.identificacion), "Fecha Inicial": fecha("2025-02-01"), "Fecha Final": fecha("2026-01-31"), "Acumulado Dias": 15 },
  ])
  libro({ PROGRAMACION: programacion, "VAC ANUAL 2026": acumulados }, "vacaciones_demo.xlsx")
}

// ── Salida ───────────────────────────────────────────────────────────────────

const TABLAS_A_VACIAR = [
  "incapacidad_alertas", "incapacidad_pqrd", "incapacidad_gestiones", "incapacidad_pagos", "incapacidades",
  "incapacidad_cargas", "incapacidad_auditoria", "incapacidad_alertas_ejecuciones", "colaboradores",
  "turnos_medicos", "turnos_auxiliares", "turnos_medicos_trash", "turnos_auxiliares_trash", "turnos_catalogo",
  "user_preferences",
]

const lit = (v: unknown): string => {
  if (v === null || v === undefined) return "null"
  if (typeof v === "number" || typeof v === "boolean") return String(v)
  if (Array.isArray(v)) return `array[${v.map(lit).join(",")}]::text[]`
  return `'${String(v).replace(/'/g, "''")}'`
}
function inserts(tabla: string, filas: Record<string, unknown>[], lote = 500): string {
  if (!filas.length) return ""
  const cols = Object.keys(filas[0])
  const out: string[] = []
  for (let i = 0; i < filas.length; i += lote) {
    const valores = filas.slice(i, i + lote).map((f) => `(${cols.map((c) => lit(f[c])).join(",")})`).join(",\n")
    out.push(`insert into public.${tabla} (${cols.join(",")}) values\n${valores};`)
  }
  return out.join("\n")
}

function args() {
  const a = process.argv.slice(2)
  const i = a.indexOf("--sql")
  const j = a.indexOf("--archivos")
  return { sql: i >= 0 ? a[i + 1] : null, archivos: j >= 0 ? a[j + 1] : null, aplicar: a.includes("--aplicar") }
}

function clienteDemo() {
  const url = process.env.DEMO_SUPABASE_URL
  const key = process.env.DEMO_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Faltan DEMO_SUPABASE_URL / DEMO_SUPABASE_SERVICE_ROLE_KEY")
  const norm = (u: string) => u.trim().replace(/\/+$/, "").toLowerCase()
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && norm(process.env.NEXT_PUBLIC_SUPABASE_URL) === norm(url)) {
    throw new Error("DEMO_SUPABASE_URL apunta al proyecto real: no se siembra nada")
  }
  if (key === process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("La llave demo es la del proyecto real: no se siembra nada")
  return createClient(url, key, { auth: { persistSession: false } })
}

async function main() {
  try {
    process.loadEnvFile(".env")
  } catch {
    /* sin .env: el simulacro, --sql y --archivos siguen funcionando */
  }
  const { sql, archivos, aplicar } = args()
  const hoy = iso(new Date())
  const cols = crearColaboradores()
  const { incs, pagos, gestiones } = crearIncapacidades(cols, hoy)
  const { filasMed, filasAux } = crearTurnos(cols)
  const colaboradores = cols.map((c) => ({
    identificacion: c.identificacion, nombre: c.nombre, cargo: c.cargo, sede: c.sede,
    fondo_pensiones: c.fondo_pensiones, origen: "demo", created_by: "demo", updated_by: "demo",
  }))

  console.log(`Colaboradores: ${colaboradores.length}`)
  console.log(`Incapacidades: ${incs.length} (pagos ${pagos.length}, gestiones ${gestiones.length})`)
  console.log(`Turnos: médicos ${filasMed.length} filas, auxiliares ${filasAux.length} filas`)

  const carga = { archivo: "datos-demo", tipo: "migracion", usuario: "demo", duplicadas: 0, rechazadas: 0, para_revisar: 0 }

  if (sql) {
    const partes = [
      "-- Generado por scripts/sembrar-demo.ts. SOLO para el proyecto Supabase DEMO.",
      "begin;",
      `truncate ${TABLAS_A_VACIAR.map((t) => `public.${t}`).join(", ")} restart identity cascade;`,
      inserts("colaboradores", colaboradores),
      `select public.incapacidades_importar(${lit(JSON.stringify(carga))}::jsonb, ${lit(JSON.stringify(incs))}::jsonb, ${lit(JSON.stringify(pagos))}::jsonb, ${lit(JSON.stringify(gestiones))}::jsonb);`,
      inserts("turnos_medicos", filasMed),
      inserts("turnos_auxiliares", filasAux),
      "commit;",
    ]
    fs.writeFileSync(sql, partes.filter(Boolean).join("\n\n") + "\n")
    console.log(`SQL escrito en ${sql}. Las alertas se generan con «Evaluar ahora» en la app.`)
  }

  if (archivos) escribirArchivos(archivos, cols, incs, hoy)

  if (!aplicar) {
    if (!sql && !archivos) console.log("\nSimulacro: no se escribió nada. Use --aplicar o --sql <archivo>.")
    return
  }

  const db = clienteDemo()
  const ok = <T>(r: { data: T; error: { message: string } | null }, que: string) => {
    if (r.error) throw new Error(`${que}: ${r.error.message}`)
    return r.data
  }
  // Vaciar en orden (hijos primero). Filtro "siempre verdadero" porque PostgREST exige uno.
  const COLUMNA: Record<string, string> = {
    colaboradores: "identificacion", turnos_catalogo: "modulo", user_preferences: "usuario",
    turnos_medicos: "medico", turnos_auxiliares: "medico",
  }
  for (const t of TABLAS_A_VACIAR) {
    ok(await db.from(t).delete().not(COLUMNA[t] ?? "id", "is", null), `vaciar ${t}`)
  }
  ok(await db.from("colaboradores").insert(colaboradores), "colaboradores")
  ok(await db.rpc("incapacidades_importar", { p_carga: carga, p_incapacidades: incs, p_pagos: pagos, p_gestiones: gestiones }), "incapacidades")
  for (let i = 0; i < filasMed.length; i += 1000) ok(await db.from("turnos_medicos").insert(filasMed.slice(i, i + 1000)), "turnos médicos")
  for (let i = 0; i < filasAux.length; i += 1000) ok(await db.from("turnos_auxiliares").insert(filasAux.slice(i, i + 1000)), "turnos auxiliares")
  const r = await evaluarYRegistrar(db, "manual", "demo")
  console.log(`\n✓ Demo sembrada. Alertas nuevas: ${r.nuevas}`)
}

main().catch((e) => {
  console.error(`\n✗ ${e instanceof Error ? e.message : e}`)
  process.exit(1)
})
