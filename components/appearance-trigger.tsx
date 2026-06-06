"use client"

import { Palette } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { AppearancePanel } from "@/components/appearance-panel"

export function AppearanceTrigger() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Personalizar apariencia" className="size-9">
          <Palette className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[340px] overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Apariencia</SheetTitle>
          <SheetDescription>Tema, fondo y colores de turno.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          <AppearancePanel />
        </div>
      </SheetContent>
    </Sheet>
  )
}
