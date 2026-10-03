import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'server/test/**/*.test.ts',
      'display/test/**/*.test.ts',
      'admin/test/**/*.test.ts',
    ],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['server/src/**/*.ts'],
      exclude: [
        'server/src/motor/typer.ts', // ren typedeklaration, ingen kode at daekke
        'server/src/index.ts', // opstartsledningen; daekkes af roegtest, ikke af unittest
        'server/src/konfig.ts', // laeses af enhver opstart; daekkes af roegtesten
        'server/src/ws/**', // udsendingen testes i fase 7 sammen med genforbindelsen
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
