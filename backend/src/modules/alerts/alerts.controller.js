/**
 * Alerts Controller
 * Handles GET /api/v1/alerts, GET /api/v1/alerts/:id, PATCH /api/v1/alerts/:id
 */
const Alert = require('../../models/Alert');
const asyncHandler = require('../../utils/asyncHandler');
const { successResponse, errorResponse } = require('../../utils/apiResponse');
const { updateAlertStatusSchema, getAlertsQuerySchema } = require('./alerts.schema');
const { updateAlertStatus } = require('../../services/alertService');

/**
 * GET /api/v1/alerts
 * List alerts with filtering, sorting, and pagination.
 * By default, returns active alerts ('open', 'acknowledged').
 */
const getAlerts = asyncHandler(async (req, res) => {
  const queryResult = getAlertsQuerySchema.safeParse(req.query);
  if (!queryResult.success) {
    return errorResponse(res, 'Invalid query parameters', 400, queryResult.error.errors);
  }

  const { status, severity, apiName, apiId, from, to, page, limit, sort } = queryResult.data;

  const filter = {};

  // Status filter: defaults to active ('open', 'acknowledged') unless specified
  if (!status || status === 'active') {
    filter.status = { $in: ['open', 'acknowledged'] };
  } else if (status !== 'all') {
    filter.status = status;
  }

  // Severity filter
  if (severity) {
    filter.severity = severity;
  }

  // API filter
  if (apiId) {
    filter.apiId = apiId;
  }
  if (apiName) {
    filter.apiName = { $regex: new RegExp(apiName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') };
  }

  // Date range filter
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }

  // Sorting
  let sortOption = { lastSeenAt: -1, createdAt: -1 };
  if (sort) {
    const isDesc = sort.startsWith('-');
    const field = isDesc ? sort.substring(1) : sort;
    sortOption = { [field]: isDesc ? -1 : 1 };
  }

  const skip = (page - 1) * limit;

  const [alerts, total] = await Promise.all([
    Alert.find(filter).sort(sortOption).skip(skip).limit(limit),
    Alert.countDocuments(filter),
  ]);

  return successResponse(res, {
    alerts,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    },
  }, 'Alerts retrieved successfully');
});

/**
 * GET /api/v1/alerts/:id
 * Retrieve a single alert by ID.
 */
const getAlertById = asyncHandler(async (req, res) => {
  const alert = await Alert.findById(req.params.id);
  if (!alert) {
    return errorResponse(res, 'Alert not found', 404);
  }
  return successResponse(res, alert, 'Alert retrieved successfully');
});

/**
 * PATCH /api/v1/alerts/:id
 * Acknowledge or resolve an alert with strict lifecycle transition validation.
 */
const patchAlert = asyncHandler(async (req, res) => {
  const parsed = updateAlertStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return errorResponse(res, 'Validation failed', 400, parsed.error.errors);
  }

  try {
    const updatedAlert = await updateAlertStatus(req.params.id, parsed.data.status);
    return successResponse(
      res,
      updatedAlert,
      `Alert successfully transitioned to ${parsed.data.status}`
    );
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return errorResponse(res, err.message, statusCode);
  }
});

/**
 * PATCH /api/v1/alerts/:id/acknowledge
 * Convenience endpoint for acknowledging an alert.
 */
const acknowledgeAlertHandler = asyncHandler(async (req, res) => {
  try {
    const updatedAlert = await updateAlertStatus(req.params.id, 'acknowledged');
    return successResponse(res, updatedAlert, 'Alert acknowledged successfully');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return errorResponse(res, err.message, statusCode);
  }
});

/**
 * PATCH /api/v1/alerts/:id/resolve
 * Convenience endpoint for resolving an alert.
 */
const resolveAlertHandler = asyncHandler(async (req, res) => {
  try {
    const updatedAlert = await updateAlertStatus(req.params.id, 'resolved');
    return successResponse(res, updatedAlert, 'Alert resolved successfully');
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return errorResponse(res, err.message, statusCode);
  }
});

module.exports = {
  getAlerts,
  getAlertById,
  patchAlert,
  acknowledgeAlertHandler,
  resolveAlertHandler,
};
