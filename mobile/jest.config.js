module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.js'],
  // Node core module used by the fixture contract (fs to load fixtures —
  // test tooling only; the core package itself stays pure)
  testEnvironment: 'node'
}
