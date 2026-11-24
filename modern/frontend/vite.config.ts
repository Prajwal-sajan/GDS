import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const api = process.env.JOURNEYOS_API ?? "http://localhost:5080";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": api, "/redbus": api, "/health": api, "/hubs": { target: api, ws: true } },
  },
});
