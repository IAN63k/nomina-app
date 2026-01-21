'use client';

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";

export default function Home() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
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
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <div className="grid auto-rows-min gap-4 md:grid-cols-3">
        <div className="bg-muted/50 aspect-video rounded-xl flex items-center justify-center">
          <div className="text-center p-4">
            <h3 className="font-semibold mb-2">Empleados</h3>
            <p className="text-sm text-muted-foreground">
              Gestiona la información de tus empleados
            </p>
          </div>
        </div>
        <div className="bg-muted/50 aspect-video rounded-xl flex items-center justify-center">
          <div className="text-center p-4">
            <h3 className="font-semibold mb-2">Nóminas</h3>
            <p className="text-sm text-muted-foreground">
              Procesa y administra las nóminas
            </p>
          </div>
        </div>
        <div className="bg-muted/50 aspect-video rounded-xl flex items-center justify-center">
          <div className="text-center p-4">
            <h3 className="font-semibold mb-2">Reportes</h3>
            <p className="text-sm text-muted-foreground">
              Genera reportes y estadísticas
            </p>
          </div>
        </div>
      </div>
      <div className="bg-card border rounded-xl p-6 flex-1">
        <h2 className="text-2xl font-bold mb-4">
          ¡Bienvenido al Sistema de Gestión de Nóminas!
        </h2>
        <p className="text-muted-foreground mb-6">
          Has iniciado sesión correctamente. El dashboard se implementará próximamente.
        </p>
        
        <div className="mt-6 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold mb-2">Información de usuario:</h4>
          <div className="text-sm space-y-1">
            <p><span className="font-medium">Nombre:</span> {user?.name}</p>
            <p><span className="font-medium">Email:</span> {user?.email}</p>
            <p><span className="font-medium">Rol:</span> {user?.role}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
