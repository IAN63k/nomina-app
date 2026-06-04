import type { NextConfig } from "next";
import { readFileSync } from "node:fs";

// Versión del build, leída de package.json y expuesta al cliente. Se compara contra
// /api/version (versión desplegada en el servidor) para avisar de una nueva versión.
const { version } = JSON.parse(readFileSync("./package.json", "utf8")) as { version: string };

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
};

export default nextConfig;
