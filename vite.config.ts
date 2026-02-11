import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    host: true, // Allow network access for mobile testing
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  }
});
