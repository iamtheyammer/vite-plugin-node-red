import { RED } from "node-red__editor-client";

export {}; // Ensures the file is treated as a module

declare global {
  const RED: RED;
}
