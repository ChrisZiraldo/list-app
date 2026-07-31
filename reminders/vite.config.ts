import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'reminders/client',
  base: '/reminders/',
  plugins: [react()],
  publicDir: false,
  build: { outDir: '../../dist/reminders/client', emptyOutDir: true },
});
