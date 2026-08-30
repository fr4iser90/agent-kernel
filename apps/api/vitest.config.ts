import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/presentation/main.ts',
        'src/domain/catalog/project.ts',
        'src/domain/catalog/project-repository.ts',
        'src/infrastructure/dsh/dsh-cli-executor.ts',
        'src/domain/identity/owner.ts',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: {
        lines: 60,
        functions: 60,
        statements: 60,
        branches: 50,
      },
    },
  },
})
