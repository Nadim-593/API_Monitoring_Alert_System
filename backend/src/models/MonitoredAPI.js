const mongoose = require('mongoose');
const env = require('../config/env');

const monitoredAPISchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'API name is required'],
      trim: true,
    },
    url: {
      type: String,
      required: [true, 'API URL is required'],
      validate: {
        validator: (v) => {
          try {
            new URL(v);
            return true;
          } catch {
            return false;
          }
        },
        message: (props) => `${props.value} is not a valid URL`,
      },
    },
    method: {
      type: String,
      enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      default: 'GET',
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    intervalSeconds: {
      type: Number,
      default: () => parseInt(env.DEFAULT_CHECK_INTERVAL_SECONDS, 10),
      min: [10, 'Interval must be at least 10 seconds'],
      max: [86400, 'Interval cannot exceed 86400 seconds (24 hours)'],
    },
    timeoutMs: {
      type: Number,
      default: () => parseInt(env.DEFAULT_TIMEOUT_MS, 10),
      min: [1000, 'Timeout must be at least 1000ms'],
      max: [30000, 'Timeout cannot exceed 30000ms'],
    },
    headers: {
      type: Map,
      of: String,
      default: {},
    },
    body: {
      type: String,
      default: null,
    },
    thresholds: {
      responseTimeMs: {
        type: Number,
        default: () => parseInt(env.DEFAULT_RESPONSE_TIME_THRESHOLD_MS, 10),
      },
      errorRatePercent: {
        type: Number,
        default: () => parseInt(env.DEFAULT_ERROR_RATE_THRESHOLD_PERCENT, 10),
      },
      consecutiveFailures: {
        type: Number,
        default: 3,
      },
    },
    tags: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
monitoredAPISchema.index({ enabled: 1 });
monitoredAPISchema.index({ url: 1 });

const MonitoredAPI = mongoose.model('MonitoredAPI', monitoredAPISchema);

module.exports = MonitoredAPI;
