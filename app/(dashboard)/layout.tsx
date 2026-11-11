'use client';

import { AppSidebar } from "@/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SettingsSidebar } from "@/components/settings-sidebar";
import { AppearanceTrigger } from "@/components/appearance-trigger";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { MedicosTurnosProvider } from "@/contexts/medicos-turnos-context";
import { AuxiliaresTurnosProvider } from "@/contexts/auxiliares-turnos-context";
import { SettingsSidebarProvider } from "@/contexts/settings-sidebar-context";
import { EmpleadosProvider } from "@/contexts/empleados-context";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { FlaskConical, LogIn } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, isLoading, sesionVencida, logout } = useAuth();

  // Sin sesión (o sesión firmada inválida al abrir) → al login.
  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/login");
  }, [isLoading, isAuthenticated, router]);
  
  // Obtener el nombre de la página actual
  const getPageName = () => {
    if (pathname === '/') return 'Dashboard';
    if (pathname === '/vacaciones') return 'Gestión de Vacaciones';
    if (pathname === '/recargos') return 'Gestión de Recargos';
    if (pathname === '/empleados') return 'Lista de Empleados';
    if (pathname === '/incapacidades') return 'Incapacidades';
    return 'Página';
  };

  return (
    <EmpleadosProvider>
    <MedicosTurnosProvider>
    <AuxiliaresTurnosProvider>
      <SettingsSidebarProvider>
        <SidebarProvider defaultOpen={false}>
          <AppSidebar />
          <SidebarInset>
            <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
              <div className="flex items-center gap-2 px-4">
                <SidebarTrigger className="-ml-1" />
                <Separator
                  orientation="vertical"
                  className="mr-2 data-[orientation=vertical]:h-4"
                />
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem className="hidden md:block">
                      <BreadcrumbLink href="/">
                        Nomina App
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator className="hidden md:block" />
                    <BreadcrumbItem>
                      <BreadcrumbPage>{getPageName()}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </div>
              <div className="ml-auto flex items-center gap-1 px-4">
                <AppearanceTrigger />
                <SettingsSidebar />
              </div>
            </header>
            {user?.demo && (
              <div role="status" className="mx-4 mb-2 flex items-center gap-2 rounded-lg border border-sky-300 bg-sky-50 px-4 py-2 text-sm text-sky-900 md:mx-6 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
                <FlaskConical className="h-4 w-4 shrink-0" />
                <span>
                  <strong>Modo demostración:</strong> Los cambios no afectan la información real ni consolidados de excel.
                </span>
              </div>
            )}
            {sesionVencida && (
              <div role="alert" className="mx-4 mb-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 md:mx-6 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <span>
                  Tu sesión venció y no se pudo guardar. Para no perder lo que estás haciendo, inicia sesión en otra pestaña,
                  vuelve aquí y repite la acción.
                </span>
                <span className="flex gap-2">
                  <button type="button" onClick={() => window.open("/login", "_blank", "noopener")}
                    className="inline-flex items-center gap-1.5 rounded-md border border-amber-400 bg-white px-3 py-1 text-xs font-medium hover:bg-amber-100 dark:bg-transparent">
                    <LogIn className="h-3.5 w-3.5" /> Iniciar sesión en otra pestaña
                  </button>
                  <button type="button" onClick={async () => { await logout(); router.push("/login"); }}
                    className="rounded-md px-3 py-1 text-xs font-medium hover:underline">
                    Ir al inicio de sesión
                  </button>
                </span>
              </div>
            )}
            <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center align-middle px-4 md:px-6">
              {children}
            </main>
          </SidebarInset>
        </SidebarProvider>
      </SettingsSidebarProvider>
    </AuxiliaresTurnosProvider>
    </MedicosTurnosProvider>
    </EmpleadosProvider>
  );
}
