import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/src/lib/supabase-server"

export async function POST(req: NextRequest) {
  try {
    const { usuario, password } = await req.json()

    if (!usuario?.trim() || !password?.trim()) {
      return NextResponse.json(
        { error: "Usuario y contraseña son requeridos." },
        { status: 400 }
      )
    }

    const supabase = getSupabaseServerClient()

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

    return NextResponse.json({
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
