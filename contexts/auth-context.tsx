'use client'

import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { AuthContextType, LoginCredentials, User } from '@/types/auth'
import { EVENTO_SESION_VENCIDA } from '@/src/lib/apiCliente'

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const SESSION_KEY = 'auth_user'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]         = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [sesionVencida, setSesionVencida] = useState(false)

  // Restaurar sesión guardada al montar y comprobar que la cookie firmada siga
  // vigente: si no (venció o es de una versión anterior), se cierra la sesión y
  // el layout manda al login. Al abrir la app aún no hay trabajo que perder.
  useEffect(() => {
    let saved: User | null = null
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      if (raw) saved = JSON.parse(raw) as User
    } catch {
      localStorage.removeItem(SESSION_KEY)
    }
    void (async () => {
      if (saved) {
        setUser(saved)
        try {
          const res = await fetch('/api/auth/session', { cache: 'no-store' })
          if (res.status === 401) {
            setUser(null)
            localStorage.removeItem(SESSION_KEY)
          }
        } catch {
          // Sin red: se conserva la sesión local; las rutas responderán al reconectar.
        }
      }
      setIsLoading(false)
    })()
  }, [])

  // Si una ruta responde 401 mientras se trabaja NO se cierra la sesión de golpe
  // (se perderían cambios sin guardar): se muestra un aviso para volver a entrar.
  // Al volver a la pestaña se comprueba de nuevo y el aviso se quita si ya hay sesión.
  useEffect(() => {
    const vencio = () => setSesionVencida(true)
    const alVolver = async () => {
      try {
        const res = await fetch('/api/auth/session', { cache: 'no-store' })
        if (res.ok) setSesionVencida(false)
      } catch {}
    }
    window.addEventListener(EVENTO_SESION_VENCIDA, vencio)
    window.addEventListener('focus', alVolver)
    return () => {
      window.removeEventListener(EVENTO_SESION_VENCIDA, vencio)
      window.removeEventListener('focus', alVolver)
    }
  }, [])

  const login = useCallback(async (credentials: LoginCredentials) => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(credentials),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error ?? 'Error al iniciar sesión.')
      }

      const loggedUser: User = data
      setUser(loggedUser)
      setSesionVencida(false)
      localStorage.setItem(SESSION_KEY, JSON.stringify(loggedUser))
    } finally {
      setIsLoading(false)
    }
  }, [])

  const logout = useCallback(async () => {
    setUser(null)
    localStorage.removeItem(SESSION_KEY)
    // Borra la cookie de sesión firmada; si falla la red, igual cerramos en la UI.
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
  }, [])

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    sesionVencida,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider')
  }
  return context
}
