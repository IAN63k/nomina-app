"use client"

import * as React from "react"
import {
  Home,
  Users,
  FileText,
  BarChart3,
  Settings,
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

// This is sample data.
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
          title: "Procesar Nómina",
          url: "#",
        },
        {
          title: "Historial",
          url: "#",
        },
      ],
    },
    {
      title: "Reportes",
      url: "#",
      icon: BarChart3,
      items: [
        {
          title: "Reportes Mensuales",
          url: "#",
        },
        {
          title: "Reportes Anuales",
          url: "#",
        },
      ],
    },
    {
      title: "Configuración",
      url: "#",
      icon: Settings,
      items: [
        {
          title: "General",
          url: "#",
        },
        {
          title: "Usuarios",
          url: "#",
        },
      ],
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useAuth();
  
  const userData = {
    name: user?.name || "Usuario",
    email: user?.email || "usuario@example.com",
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
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border/40 px-0 py-3">
        <NavUser user={userData} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
