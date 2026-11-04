import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Capacitor APK için statik HTML/JS/CSS çıktısı (`out/`)
  output: "export",
  images: {
    unoptimized: true,
  },
  // Client-side localStorage auth + realtime paneller için Cache Components
  // instant doğrulaması gereksiz gürültü/hydration üretir; kapalı tutulur.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
