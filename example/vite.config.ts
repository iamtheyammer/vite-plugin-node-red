import { defineConfig } from "vite";
import nodeRedPlugin from "../";

export default defineConfig({
  base: "/resources/nodes/",
  mode: "production",
  build: {
    emptyOutDir: true,
    // Enable for better debugging. Also set NODE_ENV=development.
    // To use a non-inline sourcemap, some plugin changes are required.
    sourcemap: true,
    rollupOptions: {
      // Dynamically generated multi-entry object.
      // output: {
      //   entryFileNames: "[name]-[hash].js",
      // },
      // May be necessary to externalize certain modules
      // external: [...builtinModules],
    },
    assetsDir: "resources",
    outDir: "dist",
  },
  plugins: [nodeRedPlugin()],
});
