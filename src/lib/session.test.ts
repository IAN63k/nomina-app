import { describe, it, expect, beforeAll } from "vitest"
import { SignJWT } from "jose"
import { createSessionToken, verifySessionToken } from "./session"
import { puede, rolDe } from "./permisos"

const user = { id: "00000000-0000-0000-0000-000000000001", nombre: "Ana", usuario: "ana", rol: "admin" }

beforeAll(() => {
  process.env.SESSION_SECRET = "x".repeat(40)
})

describe("sesión firmada", () => {
  it("firma y verifica el usuario", async () => {
    const token = await createSessionToken(user)
    expect(await verifySessionToken(token)).toEqual(user)
  })

  it("rechaza token alterado, vencido o ausente", async () => {
    const token = await createSessionToken(user)
    const [h, , s] = token.split(".")
    const falso = Buffer.from(JSON.stringify({ sub: user.id, usuario: "ana", rol: "admin" })).toString("base64url")
    expect(await verifySessionToken(`${h}.${falso}x.${s}`)).toBeNull()
    const vencido = await new SignJWT({ usuario: "ana", rol: "admin" })
      .setProtectedHeader({ alg: "HS256" }).setSubject(user.id)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .sign(new TextEncoder().encode(process.env.SESSION_SECRET))
    expect(await verifySessionToken(vencido)).toBeNull()
    expect(await verifySessionToken(undefined)).toBeNull()
  })

  it("rechaza token firmado con otro secreto", async () => {
    const otro = await new SignJWT({ usuario: "ana", rol: "admin" })
      .setProtectedHeader({ alg: "HS256" }).setSubject(user.id).setExpirationTime("1h")
      .sign(new TextEncoder().encode("y".repeat(40)))
    expect(await verifySessionToken(otro)).toBeNull()
  })
})

describe("permisos de incapacidades", () => {
  it("mapea roles; desconocido = consulta", () => {
    expect(rolDe("admin")).toBe("administrador")
    expect(rolDe(" Analista ")).toBe("analista")
    expect(rolDe("otro")).toBe("consulta")
    expect(rolDe(null)).toBe("consulta")
  })

  it("solo el administrador anula pagos y edita parámetros", () => {
    expect(puede("admin", "anular_pago")).toBe(true)
    expect(puede("analista", "anular_pago")).toBe(false)
    expect(puede("analista", "editar_parametros")).toBe(false)
    expect(puede("analista", "registrar_pago")).toBe(true)
    expect(puede("consulta", "exportar")).toBe(true)
    expect(puede("consulta", "registrar_gestion")).toBe(false)
  })
})
