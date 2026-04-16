const pino = require('pino');

const level =
  process.env.LOG_LEVEL ||
  (process.env.NODE_ENV === 'test' ? 'silent' : process.env.NODE_ENV === 'production' ? 'info' : 'debug');

module.exports = pino({
  level,
  base: { app: 'aaa-lease-flow' }
});
