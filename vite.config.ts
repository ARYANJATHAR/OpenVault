import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],

    root: 'src/renderer',

    base: './',

    build: {
        outDir: '../../dist/renderer',
        emptyOutDir: true,
        sourcemap: true,
    },

    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src/renderer'),
            '@core': path.resolve(__dirname, 'src/core'),
            '@db': path.resolve(__dirname, 'src/db'),
            '@sync': path.resolve(__dirname, 'src/sync'),
        },
    },

    server: {
        port: 5173,
        strictPort: true,
    },

    // Security: no external requests
    define: {
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    },
});
