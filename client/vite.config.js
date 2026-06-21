import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Without this config the React plugin never loads, so esbuild falls back to the
// classic JSX runtime (which needs `import React` in every file) and the app
// crashes at runtime with "React is not defined". The plugin enables the
// automatic JSX runtime + Fast Refresh.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 }
});
