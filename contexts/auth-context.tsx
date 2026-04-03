'use client'

import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { AuthContextType, LoginCredentials, User } from '@/types/auth'

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const SESSION_KEY = 'auth_user'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]         = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Restaurar sesión guardada al montar
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SESSION_KEY)
      if (saved) setUser(JSON.parse(saved) as User)
    } catch {
      localStorage.removeItem(SESSION_KEY)
    } finally {
      setIsLoading(false)
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
      localStorage.setItem(SESSION_KEY, JSON.stringify(loggedUser))
    } finally {
      setIsLoading(false)
    }
  }, [])

  const logout = useCallback(async () => {
    setUser(null)
    localStorage.removeItem(SESSION_KEY)
  }, [])

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
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
