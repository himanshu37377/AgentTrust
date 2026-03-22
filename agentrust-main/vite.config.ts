import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/metadata/upload": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@hashgraphonline/standards-sdk/hcs14": path.resolve(
        __dirname,
        "./node_modules/@hashgraphonline/standards-sdk/dist/es/standards-sdk.es56.js",
      ),
    },
  },
}));
