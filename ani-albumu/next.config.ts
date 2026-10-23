import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Üst klasördeki (badger-legal) package dosyalarını kök sanmasın
  turbopack: { root: __dirname },
};

export default nextConfig;
