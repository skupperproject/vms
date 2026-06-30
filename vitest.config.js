import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: false,
        environment: 'node',
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
        },
        projects: [
            {
                test: {
                    name: 'unit',
                    include: [
                        'modules/src/**/*.test.js',
                        'components/management-controller/src/**/*.test.js',
                        'components/site-controller/src/**/*.test.js',
                    ],
                },
            },
            {
                test: {
                    name: 'integration',
                    include: ['tests/integration/kind/specs/**/*.test.js'],
                    fileParallelism: false,
                    testTimeout: 300_000,
                    hookTimeout: 600_000,
                },
            },
        ],
    },
});
