# Nomina App - Instrucciones para Agentes de IA

## Arquitectura del Proyecto

Este es un proyecto **Next.js 16** con App Router, TypeScript, y Tailwind CSS 4. La aplicación está configurada con React 19 y usa el patrón de Server Components por defecto.

### Estructura Principal
- `app/` - App Router con file-based routing
  - `page.tsx` - Página principal (Server Component por defecto)
  - `layout.tsx` - Layout raíz con metadata y configuración de fuentes Geist
  - `globals.css` - Estilos globales con Tailwind CSS 4 y CSS variables para theming

### Stack Tecnológico
- **Next.js 16.1.4** con App Router (Server Components)
- **React 19.2.3** + TypeScript 5
- **Tailwind CSS 4** con PostCSS (`@tailwindcss/postcss`)
- **ESLint 9** con configuración modular (eslint.config.mjs)
- **Geist Fonts** - Sans y Mono optimizadas con `next/font`

## Convenciones y Patrones Específicos

### Sistema de Rutas
- Usa App Router en `app/` directorio (NO Pages Router)
- Componentes son Server Components por defecto
- Marca explícitamente Client Components con `'use client'` cuando necesites interactividad del navegador

### Estilos y Theming
- Tailwind CSS 4 con nuevo sistema `@import "tailwindcss"` en [globals.css](app/globals.css)
- CSS variables definidas con `@theme inline` para tema light/dark
- Variables personalizadas: `--background`, `--foreground`, `--font-geist-sans`, `--font-geist-mono`
- Ejemplo de uso: `bg-background text-foreground` en lugar de colores hardcoded
- Dark mode automático con `prefers-color-scheme`

### TypeScript
- Path alias: `@/*` mapea a la raíz del proyecto (ver [tsconfig.json](tsconfig.json))
- Strict mode habilitado
- Target ES2017 con JSX: `react-jsx`

### Imágenes
- Usar `next/image` con Image component de Next.js
- Los assets estáticos van en `/public`
- Ejemplo: `<Image src="/next.svg" alt="..." width={100} height={20} />`

## Comandos de Desarrollo

```bash
npm run dev    # Servidor de desarrollo en localhost:3000
npm run build  # Build de producción
npm start      # Servidor de producción
npm run lint   # Ejecutar ESLint
```

## Consideraciones Importantes

1. **ESLint Config**: Usa nueva configuración modular (`eslint.config.mjs`) con `defineConfig` - NO `.eslintrc.json`
2. **PostCSS**: Configurado con `@tailwindcss/postcss` plugin - NO `tailwindcss` ni `autoprefixer`
3. **Fuentes**: Geist Sans y Mono ya configuradas en [layout.tsx](app/layout.tsx) - no añadir fuentes adicionales sin revisar
4. **React 19**: Usa características nuevas como async Server Components cuando sea apropiado
5. **Imports absolutos**: Prefiere `@/components/...` sobre rutas relativas
6. **Metadata**: Configurar en layout.tsx o page.tsx con objeto `metadata` (NO `Head` component)

## Flujos de Trabajo

- **Nuevas páginas**: Crear `app/[ruta]/page.tsx` (automáticamente una ruta)
- **Layouts compartidos**: Usar `layout.tsx` en subdirectorios de `app/`
- **Components reutilizables**: Crear en carpeta `components/` (aún no existe, créala si necesario)
- **Estilos personalizados**: Extender variables CSS en [globals.css](app/globals.css) con `@theme inline`
