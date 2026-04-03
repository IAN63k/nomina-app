'use client'

import { useState } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/hooks/use-auth"

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const [usuario, setUsuario]   = useState("")
  const [password, setPassword] = useState("")
  const [error, setError]       = useState("")
  const { login, isLoading }    = useAuth()
  const router                  = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    try {
      await login({ usuario, password })
      router.push("/")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar sesión.")
    }
  }

  return (
    <form
      className={cn("flex flex-col gap-6", className)}
      onSubmit={handleSubmit}
      {...props}
    >
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">Inicia sesión</h1>
          <p className="text-balance text-sm text-muted-foreground">
            Ingresa tu usuario y contraseña para continuar
          </p>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Field>
          <FieldLabel htmlFor="usuario">Usuario</FieldLabel>
          <Input
            id="usuario"
            type="text"
            placeholder="nombre_usuario"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            required
            autoComplete="username"
            disabled={isLoading}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="password">Contraseña</FieldLabel>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            disabled={isLoading}
          />
        </Field>

        <Field>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Verificando..." : "Iniciar sesión"}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  )
}
