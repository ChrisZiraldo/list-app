import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['server/**/*.test.ts', 'tests/**/*.test.ts', 'src/**/*.test.tsx', 'reminders/client/**/*.test.tsx'] },
});
