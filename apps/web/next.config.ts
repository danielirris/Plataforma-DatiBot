import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Los paquetes del workspace se distribuyen como TS fuente.
  transpilePackages: ["@plataforma/ui", "@plataforma/config", "@plataforma/products"],
};

export default nextConfig;
