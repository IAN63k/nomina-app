"use client"

import { Settings } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { useSettingsSidebar } from "@/contexts/settings-sidebar-context"

export function SettingsSidebar() {
  const { config } = useSettingsSidebar()

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Abrir ajustes"
          className="size-9"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[320px] sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{config.title}</SheetTitle>
          <SheetDescription>{config.description}</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">
          {config.content ?? (
            <p className="text-sm text-muted-foreground">
              Próximamente podrás configurar parámetros avanzados desde aquí.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
