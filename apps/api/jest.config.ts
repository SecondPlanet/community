import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json'],
  rootDir: 'src',
  testMatch: ['**/*.spec.ts'],
  moduleNameMapper: {
    '^@prisma/client$': '<rootDir>/../../../node_modules/@prisma/client',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  // Use separate DB for tests or mock Prisma entirely
  setupFilesAfterEnv: [],
  coverageDirectory: '../coverage',
  collectCoverageFrom: ['**/*.service.ts'],
};

export default config;
