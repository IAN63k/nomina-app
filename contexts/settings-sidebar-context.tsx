"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

import { DEFAULT_RECARGO_CONFIG, type RecargoConfig } from "@/src/types/recargo"

type SettingsSidebarConfig = {
  title: string
  description: string
  content: ReactNode | null
}

type SettingsSidebarContextType = {
  config: SettingsSidebarConfig
  setConfig: (config: Partial<SettingsSidebarConfig>) => void
  resetConfig: () => void
  recargoConfig: RecargoConfig
  setRecargoConfig: (config: Partial<RecargoConfig>) => void
  resetRecargoConfig: () => void
}

const defaultConfig: SettingsSidebarConfig = {
  title: "Ajustes",
  description: "Configura opciones rápidas del módulo actual.",
  content: null,
}

const SettingsSidebarContext = createContext<SettingsSidebarContextType | null>(null)

export function SettingsSidebarProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<SettingsSidebarConfig>(defaultConfig)
  const [recargoConfig, setRecargoConfigState] = useState<RecargoConfig>(DEFAULT_RECARGO_CONFIG)

  const setConfig = (partial: Partial<SettingsSidebarConfig>) => {
    setConfigState((prev) => ({ ...prev, ...partial }))
  }

  const resetConfig = () => setConfigState(defaultConfig)

  const setRecargoConfig = (partial: Partial<RecargoConfig>) => {
    setRecargoConfigState((prev) => ({ ...prev, ...partial }))
  }

  const resetRecargoConfig = () => setRecargoConfigState(DEFAULT_RECARGO_CONFIG)

  return (
    <SettingsSidebarContext.Provider
      value={{
        config,
        setConfig,
        resetConfig,
        recargoConfig,
        setRecargoConfig,
        resetRecargoConfig,
      }}
    >
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
