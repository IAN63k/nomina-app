"use client"

import * as React from "react"
import {
  Home,
  Users,
  FileText,
  Briefcase,
} from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"
import { useAuth } from "@/hooks/use-auth"
import { cn } from "@/lib/utils"
import { useResumenAlertas } from "@/components/incapacidades/alertas-pendientes"

// Solo módulos con página real. url "#" solo para encabezados de grupo (con items).
const data = {
  navMain: [
    {
      title: "Dashboard",
      url: "/",
      icon: Home,
      isActive: true,
    },
    {
      title: "Empleados",
      url: "/empleados",
      icon: Users,
    },
    {
      title: "Nóminas",
      url: "#",
      icon: FileText,
      items: [
        {
          title: "Vacaciones",
          url: "/vacaciones",
        },
        {
          title: "Recargos",
          url: "/recargos",
        },
        {
          title: "Incapacidades",
          url: "/incapacidades",
        },
      ],
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useAuth();
  // Contador de alertas de incapacidades pendientes (solo si hay sesión firmada).
  const alertas = useResumenAlertas(Boolean(user));
  const pendientes = alertas?.pendientes ?? 0;
  const navMain = React.useMemo(() => {
    if (!pendientes) return data.navMain;
    const contador = (
      <span
        className="rounded-full bg-red-600 px-1.5 text-[10px] font-semibold leading-4 text-white"
        aria-label={`${pendientes} alertas de incapacidades pendientes`}
        title={`${pendientes} alertas de incapacidades pendientes`}
      >
        {pendientes > 99 ? "99+" : pendientes}
      </span>
    );
    return data.navMain.map((item) =>
      item.items?.some((sub) => sub.url === "/incapacidades")
        ? {
            ...item,
            badge: contador,
            items: item.items.map((sub) => (sub.url === "/incapacidades" ? { ...sub, badge: contador } : sub)),
          }
        : item,
    );
  }, [pendientes]);
  
  const userData = {
    name:   user?.nombre  || "Usuario",
    email:  user?.usuario || "",
    avatar: "/avatars/user.jpg",
  };
  
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="border-b border-sidebar-border/40 bg-sidebar px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex aspect-square size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Briefcase className="size-5" />
          </div>
          <div className="flex flex-col gap-0.5 group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold leading-none">Nomina App</span>
            <span className="text-xs text-sidebar-foreground/60">Gestión de nóminas</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="px-0 py-4">
        <NavMain items={navMain} />
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border/40 px-0 py-3">
        <NavUser user={userData} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
