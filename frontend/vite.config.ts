import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Forward API + SSE to the backend during dev so cookies/JWT and SSE
      // stream through a single origin without CORS friction.
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/health": "http://localhost:3000",
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
