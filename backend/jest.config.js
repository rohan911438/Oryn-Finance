module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/**/index.js'
  ],
  coverageReporters: ['text', 'lcov', 'html'],
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/__tests__/**/*.spec.js'
  ],
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],
  moduleFileExtensions: ['js', 'json'],
  verbose: true,
  testTimeout: 10000,
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,
  mockReset: true
};