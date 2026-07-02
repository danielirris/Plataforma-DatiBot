import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Los paquetes del workspace se distribuyen como TS fuente.
  transpilePackages: ["@plataforma/ui", "@plataforma/config", "@plataforma/products"],
  // Módulos nativos: se dejan externos, no se bundlean.
  serverExternalPackages: ["sharp", "ssh2", "ssh2-sftp-client"],
};

export default nextConfig;
