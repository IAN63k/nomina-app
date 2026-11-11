# Modo demostración

Un usuario de demostración entra a la misma app pero **todas** sus consultas van a
un proyecto Supabase aparte (`nomina-app-bd-demo`) que solo tiene datos ficticios.
Sirve para mostrar la app sin exponer datos personales (Ley 1581).

## Cómo funciona

- **Login**: si el usuario escrito es `DEMO_USUARIO`, la contraseña se compara con
  `DEMO_PASSWORD` en el servidor (`src/lib/demo.ts`). No se consulta la tabla
  `usuarios` de producción. La sesión firmada lleva `demo: true` y rol `admin`.
- **Datos**: `getSupabaseServerClient(destino)` exige el usuario de la sesión. Con
  `demo: true` usa `DEMO_SUPABASE_URL` / `DEMO_SUPABASE_SERVICE_ROLE_KEY`. Si faltan,
  o si apuntan al proyecto real, lanza un error en vez de caer en la base real.
  Solo el login y el cron usan `BD_REAL` explícitamente (lo vigila `src/lib/demo.test.ts`).
- **UI**: idéntica a la real; no se muestra ningún aviso de demostración.
- **Cron**: la tarea diaria de alertas solo evalúa la base real.
- Un usuario real con el mismo nombre que `DEMO_USUARIO` no podría entrar: elegir
  un nombre que no exista (p. ej. `demo`).

## Variables de entorno (local `.env` y Vercel)

```
DEMO_USUARIO=demo
DEMO_PASSWORD=<mínimo 8 caracteres>
DEMO_SUPABASE_URL=https://ktmrazrueukdtnkipsyt.supabase.co
DEMO_SUPABASE_SERVICE_ROLE_KEY=<service_role del proyecto demo>
```

Si falta cualquiera, el modo demo queda apagado y el login se comporta como siempre.

## Levantar el proyecto demo desde cero

Aplicar en el SQL Editor del proyecto **demo**, en este orden:

1. `docs/demo/01_turnos_base.sql`
2. `docs/incapacidades.sql`
3. `docs/colaboradores.sql`
4. `docs/incapacidades_importar.sql`
5. `docs/turnos_catalogo.sql`, `docs/user_preferences.sql`
6. `docs/turnos_trash.sql`
7. `docs/demo/99_cierre_demo.sql`

(No se aplica `verificar_login`: la demo no tiene tabla de usuarios.)

## Datos ficticios

```bash
npm run demo:sembrar                            # simulacro: solo cuenta
npm run demo:sembrar -- --aplicar               # vacía y llena la BD demo + evalúa alertas
npm run demo:sembrar -- --archivos public/demo  # regenera los Excel de ejemplo
npm run demo:sembrar -- --sql salida.sql        # el mismo contenido como SQL
```

Genera 30 colaboradores (cédulas `1234500001…`), ~60 incapacidades (`9000000001…`)
con pagos, prórrogas que pasan el día 180, maternidad, tránsito, rechazadas y
prescritas, y turnos de médicos y auxiliares de octubre y noviembre de 2026
calculados con `recargoEngine` (recargos, dominicales, festivos y horas extra).
Es determinista: reejecutar `--aplicar` deja la demo como nueva antes de una presentación.

Archivos de ejemplo en `public/demo/` (descargables desde la app en `/demo/…`):

- `kactus_demo.xlsx`: 8 incapacidades nuevas + 1 duplicada para la carga de KactuS.
- `vacaciones_demo.xlsx`: hojas `PROGRAMACION` y `VAC ANUAL 2026` para Cartas de vacaciones.
