import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
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
  plugins: [
    dts({
      tsconfigPath: "./tsconfig.lib.json",
      include: ["src/lib/**/*"],
      bundleTypes: true,
    }),
    react(),
    stripJsDocComments(),
  ],
  build: {
    lib: {
      entry: "src/lib/index.ts",
      name: "remotestate",
      fileName: "remotestate",
      formats: ["es"],
    },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime"],
    },
  },
});
