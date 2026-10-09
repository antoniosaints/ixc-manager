import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";

// Only the server port is used here. IXC/DB credentials are never exposed to the browser.
const rootEnv = loadEnv("development", fileURLToPath(new URL("../", import.meta.url)), "PORT");
const backendPort = process.env.PORT ?? rootEnv.PORT ?? "3000";
if (!/^\d+$/.test(backendPort) || Number(backendPort) < 1 || Number(backendPort) > 65535)
  throw new Error("PORT deve ser uma porta válida para a API local.");
const backendTarget = `http://127.0.0.1:${backendPort}`;

export default defineConfig({
  // Load public VITE_* variables from the same root .env as the backend.
  envDir: fileURLToPath(new URL("../", import.meta.url)),
  plugins: [vue()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      // Preserve the browser-facing Host for the backend's same-origin
      // WebSocket check. Rewriting it to :3000 rejects frontend origins.
      "/api/network/live": { target: backendTarget, changeOrigin: false, ws: true },
      // SQL financial reads have individual server deadlines and can include
      // historical balances. Keep this rule before the general /api rule.
      "/api/finance": { target: backendTarget, changeOrigin: true, timeout: 90_000, proxyTimeout: 75_000 },
      // Direct Churn aggregates have a 45-second total deadline on the backend.
      "/api/retention": { target: backendTarget, changeOrigin: true, timeout: 65_000, proxyTimeout: 60_000 },
      "^/api/support/customers/[0-9]+/analysis(?:\\?.*)?$": {
        target: backendTarget,
        changeOrigin: true,
        timeout: 65_000,
        proxyTimeout: 60_000,
      },
      "/api/provider-analytics": { target: backendTarget, changeOrigin: true, timeout: 90_000, proxyTimeout: 85_000 },
      // Use IPv4 explicitly. Some environments resolve localhost differently
      // between the browser and Vite, leaving the dashboard polling forever.
      "/api": { target: backendTarget, changeOrigin: true, timeout: 8_000, proxyTimeout: 8_000 },
    },
  },
});
