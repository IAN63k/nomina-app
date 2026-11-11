import { NextRequest, NextResponse } from "next/server"
import { BD_REAL, getSupabaseServerClient } from "@/src/lib/supabase-server"
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions, type SessionUser } from "@/src/lib/session"
import { esUsuarioDemo, loginDemo } from "@/src/lib/demo"

export async function POST(req: NextRequest) {
  try {
    const { usuario, password } = await req.json()

    if (!usuario?.trim() || !password?.trim()) {
      return NextResponse.json(
        { error: "Usuario y contraseña son requeridos." },
        { status: 400 }
      )
    }

    // Usuario de demostración: se valida contra variables de entorno y nunca
    // consulta la base real. Si el nombre es el de la demo pero la contraseña
    // no coincide, no se prueba contra la tabla de usuarios.
    if (esUsuarioDemo(usuario)) {
      const demo = loginDemo(usuario, password)
      if (!demo) {
        return NextResponse.json({ error: "Usuario o contraseña incorrectos." }, { status: 401 })
      }
      return responderConSesion(demo)
    }

    const supabase = getSupabaseServerClient(BD_REAL)

    const { data, error } = await supabase.rpc("verificar_login", {
      p_usuario: usuario.trim(),
      p_password: password,
    })

    if (error) {
      console.error("Error en verificar_login:", error.message)
      return NextResponse.json(
        { error: "Error al verificar credenciales." },
        { status: 500 }
      )
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: "Usuario o contraseña incorrectos." },
        { status: 401 }
      )
    }

    const user = data[0]
    return responderConSesion({
      id:      user.id,
      nombre:  user.nombre,
      usuario: user.usuario,
      rol:     user.rol,
    })
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    )
  }
}

// Cookie firmada httpOnly: la validan las rutas de servidor que manejan
// datos sensibles. La UI sigue usando el JSON + localStorage.
async function responderConSesion(sessionUser: SessionUser) {
  const res = NextResponse.json(sessionUser)
  try {
    res.cookies.set(SESSION_COOKIE, await createSessionToken(sessionUser), sessionCookieOptions())
  } catch (e) {
    // Sin SESSION_SECRET el resto de la app sigue funcionando; solo las
    // rutas con datos responderán 401.
    console.error("No se pudo emitir la cookie de sesión:", (e as Error).message)
  }
  return res
}
