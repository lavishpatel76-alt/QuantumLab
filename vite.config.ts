import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  esbuild: {
    target: 'es2020',
  },
  build: {
    target: 'es2020',
  },
})
