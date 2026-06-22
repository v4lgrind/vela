/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**"],
  },
  server: {
    port: 5173,
    host: true, // Allow network access for mobile testing
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'hls': ['hls.js'],
          'jellyfin': ['@jellyfin/sdk'],
          'vendor-vue': ['vue', 'vue-router', 'pinia'],
          'vendor-ui': ['reka-ui', 'lucide-vue-next'],
        },
      },
    },
  }
});
