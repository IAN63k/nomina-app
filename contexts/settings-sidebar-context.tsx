"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

type SettingsSidebarConfig = {
  title: string
  description: string
  content: ReactNode | null
}

type SettingsSidebarContextType = {
  config: SettingsSidebarConfig
  setConfig: (config: Partial<SettingsSidebarConfig>) => void
  resetConfig: () => void
}

const defaultConfig: SettingsSidebarConfig = {
  title: "Ajustes",
  description: "Configura opciones rápidas del módulo actual.",
  content: null,
}

const SettingsSidebarContext = createContext<SettingsSidebarContextType | null>(null)

export function SettingsSidebarProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<SettingsSidebarConfig>(defaultConfig)

  const setConfig = (partial: Partial<SettingsSidebarConfig>) => {
    setConfigState((prev) => ({ ...prev, ...partial }))
  }

  const resetConfig = () => setConfigState(defaultConfig)

  return (
    <SettingsSidebarContext.Provider value={{ config, setConfig, resetConfig }}>
      {children}
    </SettingsSidebarContext.Provider>
  )
}

export function useSettingsSidebar() {
  const context = useContext(SettingsSidebarContext)
  if (!context) {
    throw new Error("useSettingsSidebar must be used within a SettingsSidebarProvider")
  }
  return context
}
