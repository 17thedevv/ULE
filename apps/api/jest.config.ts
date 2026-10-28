import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts', 'mjs'],
  rootDir: '.',
  testRegex: '.*(?<!e2e|integration)\\.spec\\.ts$',
  setupFiles: ['<rootDir>/test/setup.ts'],
  transform: {
    '^.+\\.(t|j|mj)s$': [
      'ts-jest',
      {
        tsconfig: {
          allowJs: true,
          module: 'commonjs',
          target: 'ES2022',
          moduleResolution: 'node',
          esModuleInterop: true,
        },
      },
    ],
  },
  transformIgnorePatterns: [],
  collectCoverageFrom: ['src/**/*.(t|j)s', '!src/main.ts'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@ule/contracts$': '<rootDir>/../../packages/contracts/src/index.ts',
  },
};

export default config;
