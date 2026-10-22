require('dotenv').config();

const env = require('./config/env');
const { connectDB, disconnectDB } = require('./config/database');
const logger = require('./config/logger');
const app = require('./app');
const { initializeScheduler, stopAllSchedules } = require('./services/monitoringEngine');

const PORT = env.PORT || 5000;

let server;

const startServer = async () => {
  try {
    // Connect to MongoDB before accepting requests
    await connectDB();

    // Start monitoring scheduler after DB is connected
    await initializeScheduler();

    server = app.listen(PORT, () => {
      logger.info(
        { port: PORT, env: env.NODE_ENV },
        `PulseWatch AI server is running on port ${PORT}`
      );
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to start server');
    process.exit(1);
  }
};

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

const shutdown = async (signal) => {
  logger.info(`${signal} received — shutting down gracefully`);

  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed');
      stopAllSchedules();
      await disconnectDB();
      logger.info('Shutdown complete');
      process.exit(0);
    });

    // Force exit if graceful shutdown takes too long
    setTimeout(() => {
      logger.error('Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, 10000);
  } else {
    await disconnectDB();
    process.exit(0);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled Promise Rejection — shutting down');
  if (server) {
    server.close(() => process.exit(1));
  } else {
    process.exit(1);
  }
});

startServer();
