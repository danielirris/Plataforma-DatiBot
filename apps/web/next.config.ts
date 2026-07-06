import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Build autocontenido para Docker/EasyPanel: genera .next/standalone con solo
  // las dependencias trazadas (incluidos los paquetes del workspace).
  output: "standalone",
  // En un monorepo pnpm hay que apuntar la raíz de tracing al repo, no a apps/web,
  // para que el standalone incluya node_modules y los paquetes @plataforma/*.
  outputFileTracingRoot: path.join(here, "../../"),
  // Los paquetes del workspace se distribuyen como TS fuente.
  transpilePackages: ["@plataforma/ui", "@plataforma/config", "@plataforma/products"],
  // Módulos nativos: se dejan externos, no se bundlean.
  serverExternalPackages: ["sharp", "ssh2", "ssh2-sftp-client"],
};

export default nextConfig;
