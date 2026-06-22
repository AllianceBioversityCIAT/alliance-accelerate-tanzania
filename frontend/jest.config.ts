import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({
  // Provide the path to the Next.js app so next/jest can load next.config.mjs
  // and .env files during tests.
  dir: './',
});

const config: Config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    // Support Next.js path alias @/* → root
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['**/__tests__/**/*.{ts,tsx}', '**/*.test.{ts,tsx}'],
  // Collect coverage from lib/ only (not generated/config files)
  collectCoverageFrom: ['lib/**/*.{ts,tsx}', '!lib/**/*.d.ts'],
};

export default createJestConfig(config);
