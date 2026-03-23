"use client"

import { ChevronRight, type LucideIcon } from "lucide-react"
import { useRouter, usePathname } from "next/navigation"
import React from "react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

export function NavMain({
  items,
}: {
  items: {
    title: string
    url: string
    icon?: LucideIcon
    isActive?: boolean
    items?: {
      title: string
      url: string
    }[]
  }[]
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [selectedItem, setSelectedItem] = React.useState<string>(items[0]?.title || "")
  const [isMounted, setIsMounted] = React.useState(false)

  React.useEffect(() => {
    const savedItem = localStorage.getItem("sidebar-selected-item")
    if (savedItem) {
      setSelectedItem(savedItem)
    }
    setIsMounted(true)
  }, [])

  const handleItemClick = (title: string, url: string) => {
    setSelectedItem(title)
    localStorage.setItem("sidebar-selected-item", title)
    if (url && url !== "#") {
      router.push(url)
    }
  }

  return (
    <SidebarGroup className="gap-3 px-0">
      <SidebarMenu className="gap-2 px-2">
        {items.map((item) => {
          const isActive = pathname === item.url || (isMounted && selectedItem === item.title)
          const hasSubItems = item.items && item.items.length > 0

          if (!hasSubItems) {
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  tooltip={item.title}
                  isActive={isActive}
                  className={cn(
                    "transition-all duration-150",
                    isActive && "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                  )}
                  onClick={() => handleItemClick(item.title, item.url)}
                >
                  <a href={item.url} className="cursor-pointer">
                    {item.icon && <item.icon className="size-4" />}
                    <span>{item.title}</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          }

          return (
            <Collapsible
              key={item.title}
              asChild
              defaultOpen={isActive || item.isActive}
              className="group/collapsible"
            >
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={isActive}
                    className={cn(
                      "transition-all duration-150",
                      isActive && "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                    )}
                    onClick={() => setSelectedItem(item.title)}
                  >
                    {item.icon && <item.icon className="size-4" />}
                    <span>{item.title}</span>
                    <ChevronRight className="ml-auto size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub className="ml-0 border-l border-sidebar-border/30 px-0 py-1">
                    {item.items?.map((subItem) => {
                      const isSubActive = pathname === subItem.url
                      return (
                        <SidebarMenuSubItem key={subItem.title}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={isSubActive}
                            className={cn(
                              "transition-all duration-150",
                              isSubActive && "bg-sidebar-accent/60 text-sidebar-accent-foreground"
                            )}
                            onClick={() => handleItemClick(subItem.title, subItem.url)}
                          >
                            <a href={subItem.url} className="cursor-pointer">
                              <span>{subItem.title}</span>
                            </a>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )
                    })}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
