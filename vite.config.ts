import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  test: {
    exclude: ["dist/**", "dist-electron/**", "release/**", "node_modules/**"]
  },
  server: {
    host: "127.0.0.1",
    port: 5173
  },
  build: {
    outDir: "dist"
  }
});
