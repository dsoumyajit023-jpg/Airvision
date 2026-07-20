import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  base: "./",
  build: {
    target: "es2020",
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
    chunkSizeWarningLimit: 2000
  },
  server: {
    host: true,
    port: 5173,
    // Required for camera access testing over LAN on mobile devices (use HTTPS in production).
    strictPort: false
  },
  preview: {
    host: true,
    port: 4173
  }
});
