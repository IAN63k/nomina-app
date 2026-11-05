import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Fechas de corte y alertas se evalúan en hora de Colombia (RNF-05).
    env: { TZ: "America/Bogota" },
  },
})
