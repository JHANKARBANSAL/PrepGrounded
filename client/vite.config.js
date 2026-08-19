import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Backend ko proxy kar rahe hain taaki frontend se /api/... call kar sakein
    // bina CORS aur absolute URLs ke jhanjhat ke.
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
