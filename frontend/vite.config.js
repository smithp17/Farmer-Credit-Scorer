import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      "/score": "http://localhost:8000",
      "/scores": "http://localhost:8000",
      "/drift": "http://localhost:8000",
      "/health": "http://localhost:8000",
    },
  },
});
