const { z } = require('zod');

const monitorCheckSchema = z.object({
  api_name: z.string().min(1).max(200).trim(),
  response_time_ms: z.number().nonnegative('response_time_ms must be >= 0'),
  status_code: z.number().int().min(100).max(599),
  records_returned: z.number().int().min(0).optional().nullable(),
  error_message: z.string().optional().nullable(),
  success: z.boolean().optional(), // auto-derived from status_code if not provided
  checked_at: z.string().datetime().optional(), // defaults to now
});

// Accept single object OR array (1–100 items)
const monitorBatchSchema = z.union([
  monitorCheckSchema,
  z.array(monitorCheckSchema).min(1).max(100),
]);

module.exports = { monitorCheckSchema, monitorBatchSchema };
