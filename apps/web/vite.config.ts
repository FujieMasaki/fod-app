import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// 開発でも本番と同じ同一originにする（architecture「公開MVPの配信と認証」）。
// Hostを書き換えない（changeOrigin: false）ので、RailsのOrigin照合とGoogleのcallback URLが
// browserの見ているoriginに揃う。
const apiTarget = process.env.FOD_API_PROXY_TARGET ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    proxy: {
      "/api": { target: apiTarget, changeOrigin: false },
      "/auth": { target: apiTarget, changeOrigin: false },
    },
  },
});
