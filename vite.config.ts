import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { BASE_PATH } from './shared/base-path.js';

export default defineConfig({ base: `${BASE_PATH}/`, plugins: [react()], build: { outDir: 'dist/client' } });
