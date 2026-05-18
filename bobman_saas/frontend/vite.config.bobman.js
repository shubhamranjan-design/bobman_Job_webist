import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build config for the dedicated bobman.ai domain (root-served).
export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: 'dist-bobman',
    emptyOutDir: true,
    sourcemap: false,
  },
});
