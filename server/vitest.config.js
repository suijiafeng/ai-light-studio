const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    testTimeout: 20000,
    // 共享同一个SQLite测试库，串行执行避免竞争
    fileParallelism: false
  }
});
