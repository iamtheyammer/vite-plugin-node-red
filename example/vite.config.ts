import { defineConfig } from "vite";
import nodeRedPlugin from "../";

export default defineConfig({
  base: "/resources/nodes/",
  mode: "production",
  build: {
    sourcemap: true,
    assetsDir: "resources",
    outDir: "dist",
  },
  plugins: [nodeRedPlugin()],
});
