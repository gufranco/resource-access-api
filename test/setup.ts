try {
  process.loadEnvFile('.env');
} catch {
  // Environment already provided by CI.
}
process.env.NODE_ENV = 'test';
process.env.CACHE_ENABLED = 'false';
