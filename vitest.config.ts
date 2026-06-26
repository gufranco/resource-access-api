import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: false,
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts', 'test/**/*.e2e-test.ts'],
    setupFiles: ['test/setup.ts'],
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/database/scripts/**',
        'src/main.ts',
        'src/**/*.module.ts',
        'src/**/*.constants.ts',
        'src/**/*.decorator.ts',
        'src/database/drizzle.ts',
        'src/common/http/problem-details.ts',
        // Declarative Drizzle table definitions, no branching logic.
        'src/database/schema.ts',
        // Thin delegation to services; exercised end-to-end in test/app.e2e-test.ts.
        'src/**/*.controller.ts',
        // Terminus health-indicator glue; exercised by the /health/ready e2e test.
        'src/health/*.health.ts',
        // Env-gated OpenTelemetry bootstrap; no behavior to assert without a collector.
        'src/observability/**',
      ],
      thresholds: { statements: 95, branches: 95, functions: 95, lines: 95, perFile: true },
    },
  },
  plugins: [swc.vite()],
});
