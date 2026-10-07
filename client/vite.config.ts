import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      // Preserve the browser-facing Host for the backend's same-origin
      // WebSocket check. Rewriting it to :3000 rejects frontend origins.
      "/api/network/live": { target: "http://127.0.0.1:3000", changeOrigin: false, ws: true },
      // SQL financial reads have individual server deadlines and can include
      // historical balances. Keep this rule before the general /api rule.
      "/api/finance": { target: "http://127.0.0.1:3000", changeOrigin: true, timeout: 90_000, proxyTimeout: 75_000 },
      // Use IPv4 explicitly. Some environments resolve localhost differently
      // between the browser and Vite, leaving the dashboard polling forever.
      "/api": { target: "http://127.0.0.1:3000", changeOrigin: true, timeout: 8_000, proxyTimeout: 8_000 },
    },
  },
});
