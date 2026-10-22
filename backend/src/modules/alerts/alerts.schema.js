const { z } = require('zod');

const updateAlertStatusSchema = z.object({
  status: z.enum(['acknowledged', 'resolved'], {
    errorMap: () => ({ message: "Status must be either 'acknowledged' or 'resolved'" }),
  }),
});

const getAlertsQuerySchema = z.object({
  status: z.enum(['open', 'acknowledged', 'resolved', 'active', 'all']).optional(),
  severity: z.enum(['critical', 'high', 'medium', 'warning', 'low']).optional(),
  apiName: z.string().optional(),
  apiId: z.string().optional(),
  from: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional(),
  to: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
});

module.exports = {
  updateAlertStatusSchema,
  getAlertsQuerySchema,
};
