import { defineConfig } from "vite";
import nodeRedPlugin from "../";

export default defineConfig({
  plugins: [nodeRedPlugin()],
});
