/**
 * PulseWatch AI Database Seeder
 * Populates realistic monitored APIs, check history, and initial alerts.
 * Usage: node src/utils/seedData.js
 */
require('dotenv').config();

const mongoose = require('mongoose');
const env = require('../config/env');
const logger = require('../config/logger');
const { connectDB, disconnectDB } = require('../config/database');
const MonitoredAPI = require('../models/MonitoredAPI');
const MonitoringCheck = require('../models/MonitoringCheck');
const Alert = require('../models/Alert');
const { createOrUpdateAlert } = require('../services/alertService');
const { detectAnomalies } = require('../services/anomalyDetector');

const sampleApis = [
  {
    name: 'PatientDataAPI',
    url: 'https://jsonplaceholder.typicode.com/posts',
    method: 'GET',
    enabled: true,
    intervalSeconds: 30,
    timeoutMs: 5000,
    thresholds: { responseTimeMs: 2000, criticalLatencyMs: 5000, expectRecords: true },
    tags: ['healthcare', 'patients', 'core'],
  },
  {
    name: 'AppointmentSchedulingAPI',
    url: 'https://jsonplaceholder.typicode.com/users',
    method: 'GET',
    enabled: true,
    intervalSeconds: 60,
    timeoutMs: 8000,
    thresholds: { responseTimeMs: 2000, criticalLatencyMs: 5000 },
    tags: ['appointments', 'scheduling'],
  },
  {
    name: 'BillingGatewayAPI',
    url: 'https://httpbin.org/status/200',
    method: 'GET',
    enabled: true,
    intervalSeconds: 45,
    timeoutMs: 5000,
    thresholds: { responseTimeMs: 1500, criticalLatencyMs: 4000 },
    tags: ['billing', 'payments'],
  },
  {
    name: 'LabResultsSyncAPI',
    url: 'https://httpbin.org/delay/1',
    method: 'GET',
    enabled: true,
    intervalSeconds: 60,
    timeoutMs: 10000,
    thresholds: { responseTimeMs: 2000, criticalLatencyMs: 5000 },
    tags: ['laboratory', 'sync'],
  },
  {
    name: 'LegacyEHRBridge',
    url: 'https://httpbin.org/status/500',
    method: 'GET',
    enabled: false,
    intervalSeconds: 120,
    timeoutMs: 10000,
    thresholds: { responseTimeMs: 2000 },
    tags: ['legacy', 'paused'],
  },
];

async function seed() {
  logger.info('Connecting to MongoDB for seeding...');
  await connectDB();

  logger.info('Clearing existing collection data...');
  await Promise.all([
    MonitoredAPI.deleteMany({}),
    MonitoringCheck.deleteMany({}),
    Alert.deleteMany({}),
  ]);

  logger.info('Seeding MonitoredAPIs...');
  const createdApis = await MonitoredAPI.insertMany(sampleApis);
  logger.info({ count: createdApis.length }, 'MonitoredAPIs seeded');

  logger.info('Seeding historical telemetry checks & alerts...');
  const now = Date.now();

  // Create 30 telemetry points across the last 2 hours
  for (let i = 0; i < 30; i++) {
    const timestamp = new Date(now - (30 - i) * 4 * 60 * 1000);
    const api = createdApis[i % createdApis.length];

    // Introduce deliberate anomalies for variety
    let statusCode = 200;
    let responseTime = 120 + Math.floor(Math.random() * 200);
    let records = 10 + Math.floor(Math.random() * 40);
    let success = true;
    let errorMessage = null;

    if (i === 18) {
      // Degraded latency
      responseTime = 2850;
    } else if (i === 22) {
      // 500 server error
      statusCode = 500;
      success = false;
      errorMessage = 'HTTP 500 Internal Server Error';
      records = 0;
    } else if (i === 26) {
      // Zero records with expectRecords=true on PatientDataAPI
      if (api.name === 'PatientDataAPI') {
        records = 0;
      }
    }

    const checkData = {
      responseTimeMs: responseTime,
      statusCode,
      recordsReturned: records,
      success,
      errorMessage,
    };

    const anomalyResult = detectAnomalies(checkData, api);

    const check = new MonitoringCheck({
      apiId: api._id,
      apiName: api.name,
      responseTimeMs: responseTime,
      statusCode,
      recordsReturned: records,
      success,
      errorMessage,
      checkedAt: timestamp,
      anomalyDetected: anomalyResult.anomalyDetected,
      anomalyDetails: anomalyResult.details || null,
      reasonCodes: anomalyResult.reasonCodes,
      severity: anomalyResult.severity,
    });

    await check.save();

    if (anomalyResult.anomalyDetected) {
      await createOrUpdateAlert({
        apiId: api._id.toString(),
        apiName: api.name,
        severity: anomalyResult.severity,
        reasonCodes: anomalyResult.reasonCodes,
        summary: anomalyResult.details,
        metricsSnapshot: {
          responseTimeMs: responseTime,
          statusCode,
          recordsReturned: records,
        },
        expectRecords: api.thresholds?.expectRecords,
      });
    }
  }

  const alertCount = await Alert.countDocuments();
  const checkCount = await MonitoringCheck.countDocuments();
  logger.info(
    { apis: createdApis.length, checks: checkCount, alerts: alertCount },
    'Seed data successfully populated!'
  );

  await disconnectDB();
  logger.info('Disconnected from database.');
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seeding failed:', err);
      process.exit(1);
    });
}

module.exports = { seed, sampleApis };
