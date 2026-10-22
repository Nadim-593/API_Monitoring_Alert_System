require('dotenv').config();

// Validate environment variables early
const env = require('./config/env');
const logger = require('./config/logger');
const pinoHttp = require('pino-http');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const rateLimiter = require('./middleware/rateLimiter');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const monitoredApisRoutes = require('./modules/monitored-apis/monitoredApis.routes');
const monitoringRoutes = require('./modules/monitoring/monitoring.routes');
const anomalyRoutes = require('./modules/anomaly/anomaly.routes');
const alertsRoutes = require('./modules/alerts/alerts.routes');

const app = express();

// ─── Request Logging ────────────────────────────────────────────────────────
app.use(
  pinoHttp({
    logger,
    // Skip logging for health checks to reduce noise
    autoLogging: {
      ignore: (req) => req.url === '/api/v1/health',
    },
  })
);

// ─── Body Parsers ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ─── CORS ────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  })
);

// ─── Rate Limiter ────────────────────────────────────────────────────────────
app.use('/api/', rateLimiter);

// ─── Health Route ─────────────────────────────────────────────────────────────
app.get('/api/v1/health', (req, res) => {
  const dbState = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';

  res.status(200).json({
    success: true,
    message: 'PulseWatch AI API is running',
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
      version: '1.0.0',
      database: dbState,
    },
  });
});

// ─── Feature Routes ───────────────────────────────────────────────────────────
app.use('/api/v1/monitored-apis', monitoredApisRoutes);
app.use('/api/v1/monitor', monitoringRoutes);
app.use('/api/v1/monitoring', monitoringRoutes);
app.use('/api/v1/anomaly', anomalyRoutes);
app.use('/api/v1/alerts', alertsRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use(notFound);

// ─── Centralized Error Handler ────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
