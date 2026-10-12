import { defineConfig } from 'vite';

export default defineConfig({
    test: {
        environment: 'jsdom',
        include: ['src/**/*.test.js'],
        pool: 'threads',
        maxWorkers: 1,
        globals: true, // Enable describe, it, expect globals
    },
});
