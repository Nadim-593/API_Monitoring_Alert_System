const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema(
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
      required: [true, 'apiName is required'],
    },
    severity: {
      type: String,
      enum: ['critical', 'high', 'medium', 'low', 'warning'],
      required: [true, 'severity is required'],
    },
    reasonCodes: {
      type: [String],
      default: [],
    },
    summary: {
      type: String,
      required: [true, 'summary is required'],
    },
    possibleCause: {
      type: String,
      default: null,
    },
    businessImpact: {
      type: String,
      default: null,
    },
    recommendedAction: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ['open', 'acknowledged', 'resolved'],
      default: 'open',
    },
    fingerprint: {
      type: String,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
    occurrenceCount: {
      type: Number,
      default: 1,
    },
    aiGenerated: {
      type: Boolean,
      default: false,
    },
    generationMethod: {
      type: String,
      enum: ['mistral', 'fallback'],
      default: 'fallback',
    },
    aiGenerationStatus: {
      type: String,
      enum: ['success', 'failed', 'skipped'],
      default: 'skipped',
    },
    metricsSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    acknowledgedAt: {
      type: Date,
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    // createdAt is manually defined above
    timestamps: false,
  }
);

const Alert = mongoose.model('Alert', alertSchema);

module.exports = Alert;
