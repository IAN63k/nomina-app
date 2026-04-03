'use client'

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Users, Clock, Palmtree, ArrowRight, ShieldCheck } from "lucide-react"
import { useAuth } from "@/hooks/use-auth"

// ─── helpers ────────────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return "Buenos días"
  if (h < 19) return "Buenas tardes"
  return "Buenas noches"
}

function getFormattedDate() {
  const d = new Intl.DateTimeFormat("es-CO", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(new Date())
  return d.charAt(0).toUpperCase() + d.slice(1)
}

// ─── module cards ────────────────────────────────────────────────────────────

const MODULES = [
  {
    href:        "/empleados",
    icon:        Users,
    label:       "Empleados",
    description: "Carga y gestiona el listado de colaboradores y sus cédulas.",
    accent:      "#14532d",
    bg:          "#f0fdf4",
    border:      "#bbf7d0",
  },
  {
    href:        "/recargos",
    icon:        Clock,
    label:       "Recargos",
    description: "Turnos médicos, recargos nocturnos y exportación de TXT.",
    accent:      "#1e3a5f",
    bg:          "#eff6ff",
    border:      "#bfdbfe",
  },
  {
    href:        "/vacaciones",
    icon:        Palmtree,
    label:       "Vacaciones",
    description: "Registro y seguimiento de períodos de vacaciones.",
    accent:      "#713f12",
    bg:          "#fffbeb",
    border:      "#fed7aa",
  },
]

// ─── component ───────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, isAuthenticated, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push("/login")
  }, [isAuthenticated, isLoading, router])

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-foreground" />
      </div>
    )
  }

  if (!isAuthenticated) return null

  const firstName = user?.nombre?.split(" ")[0] ?? "usuario"

  return (
    <>
      {/* ── fonts ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400&family=DM+Sans:wght@300;400;500&display=swap');

        .dash-serif   { font-family: 'Lora', Georgia, serif; }
        .dash-sans    { font-family: 'DM Sans', sans-serif; }

        @keyframes fade-up {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        .anim-0 { animation: fade-up .55s cubic-bezier(.22,1,.36,1) both; }
        .anim-1 { animation: fade-up .55s cubic-bezier(.22,1,.36,1) .10s both; }
        .anim-2 { animation: fade-up .55s cubic-bezier(.22,1,.36,1) .18s both; }
        .anim-3 { animation: fade-up .55s cubic-bezier(.22,1,.36,1) .26s both; }
        .anim-4 { animation: fade-up .55s cubic-bezier(.22,1,.36,1) .34s both; }

        .module-card {
          position: relative;
          overflow: hidden;
          transition: transform .2s cubic-bezier(.22,1,.36,1), box-shadow .2s ease;
        }
        .module-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 32px -8px rgba(0,0,0,.12);
        }
        .module-card .arrow-icon {
          transition: transform .2s cubic-bezier(.22,1,.36,1), opacity .2s;
          opacity: 0;
          transform: translateX(-4px);
        }
        .module-card:hover .arrow-icon {
          opacity: 1;
          transform: translateX(0);
        }
      `}</style>

      <div className="dash-sans flex flex-1 flex-col gap-10 px-1 py-8 md:px-2">

        {/* ── greeting ── */}
        <header className="anim-0 flex flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            {getFormattedDate()}
          </p>
          <h1 className="dash-serif text-3xl font-semibold leading-tight text-foreground md:text-4xl">
            {getGreeting()},{" "}
            <em className="not-italic text-foreground/70">{firstName}.</em>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sistema de Gestión de Nóminas — vista general
          </p>
        </header>

        {/* ── divider ── */}
        <div className="anim-1 h-px w-full bg-border" />

        {/* ── module cards ── */}
        <section className="anim-2">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Módulos disponibles
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {MODULES.map((mod) => (
              <Link
                key={mod.href}
                href={mod.href}
                className="module-card block rounded-2xl border p-5"
                style={{ background: mod.bg, borderColor: mod.border }}
              >
                {/* icon */}
                <div
                  className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{ background: mod.accent + "18", color: mod.accent }}
                >
                  <mod.icon className="h-5 w-5" strokeWidth={1.75} />
                </div>

                {/* text */}
                <h2
                  className="dash-serif mb-1 text-lg font-semibold leading-snug"
                  style={{ color: mod.accent }}
                >
                  {mod.label}
                </h2>
                <p className="text-[13px] leading-relaxed text-foreground/60">
                  {mod.description}
                </p>

                {/* arrow */}
                <div className="mt-4 flex items-center gap-1" style={{ color: mod.accent }}>
                  <span className="text-xs font-medium">Ir al módulo</span>
                  <ArrowRight className="arrow-icon h-3.5 w-3.5" />
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* ── user info strip ── */}
        <footer className="anim-3 mt-auto">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background text-xs font-bold">
              {(user?.nombre ?? "U").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{user?.nombre}</p>
              <p className="truncate text-xs text-muted-foreground">@{user?.usuario}</p>
            </div>
            <div className="ml-auto flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              <ShieldCheck className="h-3 w-3" />
              {user?.rol}
            </div>
          </div>
        </footer>

      </div>
    </>
  )
}
