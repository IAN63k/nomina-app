export interface User {
  id: string
  nombre: string
  usuario: string
  rol: string
}

export interface LoginCredentials {
  usuario: string
  password: string
}

export interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
}

export interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>
  logout: () => Promise<void>
}
