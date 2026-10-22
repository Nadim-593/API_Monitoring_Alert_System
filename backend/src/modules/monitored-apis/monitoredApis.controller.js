/**
 * MonitoredAPI CRUD Controller
 */
const MonitoredAPI = require('../../models/MonitoredAPI');
const asyncHandler = require('../../utils/asyncHandler');
const { successResponse, errorResponse } = require('../../utils/apiResponse');
const {
  createMonitoredApiSchema,
  updateMonitoredApiSchema,
} = require('./monitoredApis.schema');
const { scheduleApi, unscheduleApi } = require('../../services/monitoringEngine');

/**
 * POST /api/v1/monitored-apis
 * Create a new MonitoredAPI.
 */
const createApi = asyncHandler(async (req, res) => {
  const parsed = createMonitoredApiSchema.safeParse(req.body);
  if (!parsed.success) {
    return errorResponse(res, 'Validation failed', 400, parsed.error.errors);
  }

  const api = new MonitoredAPI(parsed.data);
  await api.save();

  if (api.enabled) {
    try {
      scheduleApi(api);
    } catch (schedErr) {
      // Don't fail the HTTP response if scheduling fails
    }
  }

  return successResponse(res, api, 'Monitored API created successfully', 201);
});

/**
 * GET /api/v1/monitored-apis
 * List all monitored APIs with optional filters and pagination.
 * Query params: enabled, tags, page, limit
 */
const getAllApis = asyncHandler(async (req, res) => {
  const { enabled, tags, page = 1, limit = 20 } = req.query;

  const filter = {};

  // Filter by enabled status
  if (enabled !== undefined) {
    filter.enabled = enabled === 'true';
  }

  // Filter by tags (comma-separated)
  if (tags) {
    const tagList = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (tagList.length > 0) {
      filter.tags = { $in: tagList };
    }
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [apis, total] = await Promise.all([
    MonitoredAPI.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
    MonitoredAPI.countDocuments(filter),
  ]);

  return successResponse(res, {
    apis,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    },
  });
});

/**
 * GET /api/v1/monitored-apis/:id
 * Get a single monitored API by ID.
 */
const getApiById = asyncHandler(async (req, res) => {
  const api = await MonitoredAPI.findById(req.params.id);
  if (!api) {
    return errorResponse(res, 'Monitored API not found', 404);
  }
  return successResponse(res, api);
});

/**
 * PUT /api/v1/monitored-apis/:id
 * Update a monitored API.
 */
const updateApi = asyncHandler(async (req, res) => {
  const parsed = updateMonitoredApiSchema.safeParse(req.body);
  if (!parsed.success) {
    return errorResponse(res, 'Validation failed', 400, parsed.error.errors);
  }

  const api = await MonitoredAPI.findByIdAndUpdate(req.params.id, parsed.data, {
    new: true,
    runValidators: true,
  });

  if (!api) {
    return errorResponse(res, 'Monitored API not found', 404);
  }

  try {
    if (api.enabled) {
      scheduleApi(api);
    } else {
      unscheduleApi(api._id.toString());
    }
  } catch (schedErr) {
    // Non-fatal
  }

  return successResponse(res, api, 'Monitored API updated successfully');
});

/**
 * DELETE /api/v1/monitored-apis/:id
 * Delete a monitored API.
 */
const deleteApi = asyncHandler(async (req, res) => {
  const api = await MonitoredAPI.findByIdAndDelete(req.params.id);
  if (!api) {
    return errorResponse(res, 'Monitored API not found', 404);
  }

  try {
    unscheduleApi(req.params.id);
  } catch (schedErr) {
    // Non-fatal
  }

  return successResponse(res, { id: req.params.id }, 'Monitored API deleted successfully');
});

/**
 * PATCH /api/v1/monitored-apis/:id/toggle
 * Toggle the enabled boolean on a monitored API.
 */
const toggleApi = asyncHandler(async (req, res) => {
  const api = await MonitoredAPI.findById(req.params.id);
  if (!api) {
    return errorResponse(res, 'Monitored API not found', 404);
  }

  api.enabled = !api.enabled;
  await api.save();

  try {
    if (api.enabled) {
      scheduleApi(api);
    } else {
      unscheduleApi(api._id.toString());
    }
  } catch (schedErr) {
    // Non-fatal
  }

  return successResponse(
    res,
    api,
    `Monitored API ${api.enabled ? 'enabled' : 'disabled'} successfully`
  );
});

module.exports = { createApi, getAllApis, getApiById, updateApi, deleteApi, toggleApi };
