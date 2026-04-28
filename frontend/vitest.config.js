import { defineConfig } from 'vite';

export default defineConfig({
    test: {
        environment: 'jsdom',
        globals: true, // Enable describe, it, expect globals
    },
});
