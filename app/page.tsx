'use client';

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export default function Home() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  const handleLogout = async () => {
    try {
      await logout();
      router.push("/login");
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // El useEffect redirigirá al login
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">Nomina App</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              Bienvenido, {user?.name}
            </span>
            <Button variant="outline" onClick={handleLogout}>
              Cerrar sesión
            </Button>
          </div>
        </div>
      </header>
      
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-card border rounded-lg p-8 text-center">
            <h2 className="text-3xl font-bold mb-4">
              ¡Bienvenido al Sistema de Gestión de Nóminas!
            </h2>
            <p className="text-muted-foreground mb-6">
              Has iniciado sesión correctamente. El dashboard se implementará próximamente.
            </p>
            
            <div className="grid gap-4 md:grid-cols-3 mt-8">
              <div className="bg-secondary/50 rounded-lg p-6">
                <h3 className="font-semibold mb-2">Empleados</h3>
                <p className="text-sm text-muted-foreground">
                  Gestiona la información de tus empleados
                </p>
              </div>
              <div className="bg-secondary/50 rounded-lg p-6">
                <h3 className="font-semibold mb-2">Nóminas</h3>
                <p className="text-sm text-muted-foreground">
                  Procesa y administra las nóminas
                </p>
              </div>
              <div className="bg-secondary/50 rounded-lg p-6">
                <h3 className="font-semibold mb-2">Reportes</h3>
                <p className="text-sm text-muted-foreground">
                  Genera reportes y estadísticas
                </p>
              </div>
            </div>

            <div className="mt-8 p-4 bg-muted rounded-lg">
              <h4 className="font-semibold mb-2">Información de usuario:</h4>
              <pre className="text-left text-sm">
                {JSON.stringify(user, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
