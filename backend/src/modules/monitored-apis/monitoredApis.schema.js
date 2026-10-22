const { z } = require('zod');

const createMonitoredApiSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  url: z.string().url('Must be a valid URL'),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).default('GET'),
  enabled: z.boolean().default(true),
  intervalSeconds: z.number().int().min(10).max(86400).optional(),
  timeoutMs: z.number().int().min(1000).max(30000).optional(),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
  thresholds: z
    .object({
      responseTimeMs: z.number().int().min(100).optional(),
      errorRatePercent: z.number().min(0).max(100).optional(),
      consecutiveFailures: z.number().int().min(1).optional(),
      expectRecords: z.boolean().optional(), // if true, zero records triggers ZERO_RECORDS anomaly
    })
    .optional(),
  tags: z.array(z.string()).optional(),
});

const updateMonitoredApiSchema = createMonitoredApiSchema.partial();

module.exports = { createMonitoredApiSchema, updateMonitoredApiSchema };
