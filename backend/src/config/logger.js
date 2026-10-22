const pino = require('pino');

const isDevelopment = process.env.NODE_ENV !== 'production';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      'authorization',
      'headers.authorization',
      'req.headers.authorization',
      'password',
      '*.password',
      'token',
      '*.token',
      'secret',
      '*.secret',
      'MISTRAL_API_KEY',
      '*.MISTRAL_API_KEY',
    ],
    censor: '[REDACTED]',
  },
  ...(isDevelopment && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  }),
});

module.exports = logger;
