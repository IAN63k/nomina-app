"use client"

import * as React from "react"
import {
  Home,
  Users,
  Calendar,
  FileText,
  BarChart3,
  Settings,
  GalleryVerticalEnd,
} from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavProjects } from "@/components/nav-projects"
import { NavUser } from "@/components/nav-user"
import { TeamSwitcher } from "@/components/team-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"
import { useAuth } from "@/hooks/use-auth"

// This is sample data.
const data = {
  teams: [
    {
      name: "Nomina App",
      logo: GalleryVerticalEnd,
      plan: "Enterprise",
    },
  ],
  navMain: [
    {
      title: "Dashboard",
      url: "/",
      icon: Home,
      isActive: true,
    },
    {
      title: "Empleados",
      url: "#",
      icon: Users,
      items: [
        {
          title: "Lista de Empleados",
          url: "#",
        },
        {
          title: "Agregar Empleado",
          url: "#",
        },
      ],
    },
    {
      title: "Nóminas",
      url: "#",
      icon: FileText,
      items: [
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
  projects: [
    {
      name: "Cartas de Vacaciones",
      url: "/cartas-vacaciones",
      icon: Calendar,
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
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={data.teams} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavProjects projects={data.projects} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={userData} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
