import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function stripJsDocComments() {
  return {
    name: "strip-jsdoc-comments",
    apply: "build" as const,
    renderChunk(code: string) {
      return {
        code: code.replace(/\/\*\*[\s\S]*?\*\//g, ""),
        map: null,
      };
    },
  };
}

export default defineConfig({
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  plugins: [react(), stripJsDocComments()],
  build: {
    lib: {
      entry: {
        remotestate: "src/lib/remotestate.ts",
        path: "src/lib/path.ts",
      },
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime"],
    },
  },
});




