import { describe, it, expect, beforeEach, vi } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn((url: string) => ({ url })),
}))

import { createClient } from "@supabase/supabase-js"
import { BD_REAL, getSupabaseServerClient } from "./supabase-server"
import { demoHabilitado, esUsuarioDemo, loginDemo } from "./demo"
import { createSessionToken, verifySessionToken } from "./session"

const REAL = "https://real.supabase.co"
const DEMO = "https://demo.supabase.co"

beforeEach(() => {
  vi.mocked(createClient).mockClear()
  Object.assign(process.env, {
    SESSION_SECRET: "x".repeat(40),
    NEXT_PUBLIC_SUPABASE_URL: REAL,
    SUPABASE_SERVICE_ROLE_KEY: "llave-real",
    DEMO_SUPABASE_URL: DEMO,
    DEMO_SUPABASE_SERVICE_ROLE_KEY: "llave-demo",
    DEMO_USUARIO: "demo",
    DEMO_PASSWORD: "clave-demo-123",
  })
})

const urlUsada = () => vi.mocked(createClient).mock.calls.at(-1)![0]

describe("cliente Supabase según la sesión", () => {
  it("sesión real → proyecto real; sesión demo → proyecto demo", () => {
    getSupabaseServerClient({ demo: false })
    expect(urlUsada()).toBe(REAL)
    getSupabaseServerClient(BD_REAL)
    expect(urlUsada()).toBe(REAL)
    getSupabaseServerClient({ demo: true })
    expect(urlUsada()).toBe(DEMO)
    expect(vi.mocked(createClient).mock.calls.at(-1)![1]).toBe("llave-demo")
  })

  it("una sesión demo sin credenciales demo falla en vez de caer en la base real", () => {
    delete process.env.DEMO_SUPABASE_URL
    expect(() => getSupabaseServerClient({ demo: true })).toThrow(/DEMO_SUPABASE_URL/)
    expect(createClient).not.toHaveBeenCalled()
  })

  it("bloquea la demo si apunta al proyecto o a la llave real", () => {
    process.env.DEMO_SUPABASE_URL = REAL + "/"
    expect(() => getSupabaseServerClient({ demo: true })).toThrow(/proyecto real/)
    process.env.DEMO_SUPABASE_URL = DEMO
    process.env.DEMO_SUPABASE_SERVICE_ROLE_KEY = "llave-real"
    expect(() => getSupabaseServerClient({ demo: true })).toThrow(/llave del proyecto real/)
    expect(createClient).not.toHaveBeenCalled()
  })
})

describe("usuario demo", () => {
  it("entra con usuario (sin importar mayúsculas) y contraseña correctos, como admin demo", () => {
    const u = loginDemo(" Demo ", "clave-demo-123")
    expect(u).toMatchObject({ usuario: "demo", rol: "admin", demo: true })
    expect(loginDemo("demo", "otra")).toBeNull()
    expect(loginDemo("ana", "clave-demo-123")).toBeNull()
  })

  it("queda apagado si falta alguna variable o la contraseña es corta", () => {
    process.env.DEMO_PASSWORD = "corta"
    expect(demoHabilitado()).toBe(false)
    expect(esUsuarioDemo("demo")).toBe(false)
    expect(loginDemo("demo", "corta")).toBeNull()
    process.env.DEMO_PASSWORD = "clave-demo-123"
    delete process.env.DEMO_SUPABASE_SERVICE_ROLE_KEY
    expect(demoHabilitado()).toBe(false)
  })

  it("la marca demo viaja en la cookie firmada; una sesión normal no la tiene", async () => {
    const demo = loginDemo("demo", "clave-demo-123")!
    expect((await verifySessionToken(await createSessionToken(demo)))?.demo).toBe(true)
    const normal = { id: "u1", nombre: "Ana Prueba", usuario: "ana", rol: "admin" }
    expect(await verifySessionToken(await createSessionToken(normal))).toEqual(normal)
  })
})

describe("rutas de API", () => {
  // Solo login (verificar_login) y el cron pueden pedir la base real sin usuario.
  const PERMITIDAS_BD_REAL = new Set(["app/api/auth/login/route.ts", "app/api/incapacidades/alertas/evaluar/route.ts"])

  function rutas(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const p = join(dir, n)
      return statSync(p).isDirectory() ? rutas(p) : p.endsWith(".ts") ? [p] : []
    })
  }

  it("ninguna ruta usa BD_REAL salvo login y cron", () => {
    const usan = rutas("app/api").filter((p) => readFileSync(p, "utf8").includes("BD_REAL"))
    expect(usan.filter((p) => !PERMITIDAS_BD_REAL.has(p))).toEqual([])
  })
})
