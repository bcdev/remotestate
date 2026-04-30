import { defineConfig } from "vite";
import dts from 'vite-plugin-dts'
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  plugins: [
    dts({
      include: ['src/lib/**/*'],
      bundleTypes: true,
    }),
    react()
  ],
  build: {
    lib: {
      entry: resolve(__dirname, "src/lib/index.ts"),
      name: "zwieback",
      fileName: "zwieback",
      formats: ["es"],
    },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime"],
    },
  },
});
