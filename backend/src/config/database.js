const dns = require('dns');
const mongoose = require('mongoose');
const logger = require('./logger');

// Set public DNS servers to resolve MongoDB Atlas SRV records when local router/ISP DNS fails
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (dnsErr) {
  logger.warn({ err: dnsErr }, 'Failed to set custom DNS servers');
}

const MAX_RETRIES = 5;
const RETRY_INTERVAL_MS = 5000;

/**
 * Connect to MongoDB with retry logic.
 * @param {number} retryCount - current retry attempt
 */
const connectDB = async (retryCount = 0) => {
  const uri = process.env.MONGODB_URI;

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
    });
    logger.info('MongoDB connected successfully');
  } catch (error) {
    logger.error({ err: error }, `MongoDB connection failed (attempt ${retryCount + 1})`);

    if (retryCount < MAX_RETRIES) {
      logger.info(`Retrying MongoDB connection in ${RETRY_INTERVAL_MS / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_INTERVAL_MS));
      return connectDB(retryCount + 1);
    }

    logger.error('Max MongoDB connection retries reached. Exiting.');
    process.exit(1);
  }
};

// Connection event listeners
mongoose.connection.on('connected', () => {
  logger.info('Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  logger.error({ err }, 'Mongoose connection error');
});

mongoose.connection.on('disconnected', () => {
  logger.warn('Mongoose disconnected from MongoDB');
});

/**
 * Gracefully disconnect from MongoDB.
 */
const disconnectDB = async () => {
  await mongoose.connection.close();
  logger.info('MongoDB connection closed');
};

module.exports = { connectDB, disconnectDB };
