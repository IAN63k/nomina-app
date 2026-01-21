# Sistema de Autenticación - Nomina App

## Estructura Implementada

El sistema de autenticación está diseñado de forma escalable y preparado para integración futura con APIs backend.

### Archivos Creados

#### 1. Types (`types/auth.ts`)
Define las interfaces TypeScript para el sistema de autenticación:
- `User`: Información del usuario
- `LoginCredentials`: Credenciales de login
- `AuthState`: Estado de autenticación
- `AuthContextType`: Tipo del contexto de autenticación
- `RegisterData`: Datos para registro de usuarios

#### 2. Auth Context (`contexts/auth-context.tsx`)
Implementa el Context API de React para gestionar el estado global de autenticación:
- `AuthProvider`: Componente provider que envuelve la aplicación
- `useAuth`: Hook personalizado para acceder al contexto
- Gestiona: login, logout, registro
- Persistencia con localStorage (temporal, hasta tener backend)

#### 3. Hook Personalizado (`hooks/use-auth.ts`)
Exporta el hook `useAuth()` para usar en cualquier componente que necesite autenticación.

#### 4. Componentes UI
- `components/login-form.tsx`: Formulario de login con validación y manejo de errores
- `app/login/page.tsx`: Página de login con diseño responsivo
- Componentes shadcn/ui: Button, Input, Label, Field, Separator

## Uso

### En componentes
```tsx
'use client';

import { useAuth } from '@/hooks/use-auth';

export default function MiComponente() {
  const { user, isAuthenticated, login, logout } = useAuth();
  
  // ... tu lógica
}
```

### Proteger rutas
La página principal (`app/page.tsx`) redirige automáticamente al login si el usuario no está autenticado.

## Flujo Actual (Sin Backend)

1. **Login**: Simula autenticación con delay de 1 segundo
2. **Persistencia**: Guarda usuario en localStorage
3. **Estado Global**: Context API mantiene el estado en toda la app
4. **Logout**: Limpia localStorage y redirige al login

## Migración Futura a API Backend

Cuando implementes el backend, solo necesitas modificar las funciones en `contexts/auth-context.tsx`:

### Login con API
```tsx
const login = useCallback(async (credentials: LoginCredentials) => {
  setIsLoading(true);
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Error al iniciar sesión');
    }
    
    setUser(data.user);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
  } catch (error) {
    throw error;
  } finally {
    setIsLoading(false);
  }
}, []);
```

### Logout con API
```tsx
const logout = useCallback(async () => {
  setIsLoading(true);
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
    });
    
    setUser(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
  } catch (error) {
    console.error('Error en logout:', error);
  } finally {
    setIsLoading(false);
  }
}, []);
```

## Características Escalables

✅ **Tipado fuerte** con TypeScript  
✅ **Context API** para estado global  
✅ **Hook personalizado** reutilizable  
✅ **Preparado para JWT** tokens  
✅ **Manejo de errores** integrado  
✅ **Loading states** para UX mejorada  
✅ **Diseño responsivo** con Tailwind CSS  
✅ **Componentes shadcn/ui** consistentes  

## Próximos Pasos Recomendados

1. Implementar API de autenticación en el backend
2. Agregar middleware de Next.js para protección de rutas
3. Implementar refresh tokens para sesiones persistentes
4. Agregar OAuth (Google, GitHub, etc.)
5. Implementar recuperación de contraseña
6. Agregar página de registro completa
7. Implementar roles y permisos de usuario
