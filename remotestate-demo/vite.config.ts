import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Ensures only one React instance is used, even when local packages are
  // linked via `file:` paths (which create symlinks with separate node_modules).
  // Can be removed once all dependencies are installed from npm.
  resolve: {
    dedupe: ['react', 'react-dom']
  }
})
