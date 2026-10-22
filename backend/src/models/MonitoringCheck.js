const mongoose = require('mongoose');

const monitoringCheckSchema = new mongoose.Schema(
  {
    apiId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MonitoredAPI',
      required: false,
      default: null,
      index: true,
    },
    apiName: {
      type: String,
      default: null,
    },
    responseTimeMs: {
      type: Number,
      default: null,
    },
    statusCode: {
      type: Number,
      default: null,
    },
    recordsReturned: {
      type: Number,
      default: null,
    },
    success: {
      type: Boolean,
      required: [true, 'success field is required'],
    },
    errorMessage: {
      type: String,
      default: null,
    },
    checkedAt: {
      type: Date,
      default: Date.now,
    },
    anomalyDetected: {
      type: Boolean,
      default: false,
    },
    anomalyDetails: {
      type: String,
      default: null,
    },
    reasonCodes: {
      type: [String],
      default: [],
    },
    severity: {
      type: String,
      default: null,
    },
  },
  {
    // No automatic timestamps — checkedAt serves that purpose
    timestamps: false,
  }
);

// TTL index: auto-delete documents after 90 days (7776000 seconds)
monitoringCheckSchema.index({ checkedAt: 1 }, { expireAfterSeconds: 7776000 });

// Compound index for efficient queries by API and time range
monitoringCheckSchema.index({ apiId: 1, checkedAt: -1 });

const MonitoringCheck = mongoose.model('MonitoringCheck', monitoringCheckSchema);

module.exports = MonitoringCheck;
