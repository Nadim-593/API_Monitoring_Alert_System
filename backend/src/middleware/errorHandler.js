const { ZodError } = require('zod');
const logger = require('../config/logger');
const { errorResponse } = require('../utils/apiResponse');

/**
 * Centralized Express error handler middleware.
 * Must be mounted LAST in the middleware stack.
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  logger.error({ err, req: { method: req.method, url: req.url } }, err.message);

  // Mongoose Validation Error
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return errorResponse(res, 'Validation failed', 400, details);
  }

  // Mongoose Duplicate Key Error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {}).join(', ');
    return errorResponse(
      res,
      `Duplicate value for field: ${field}`,
      409,
      err.keyValue
    );
  }

  // Mongoose CastError (invalid ObjectId)
  if (err.name === 'CastError') {
    return errorResponse(res, `Invalid value for field: ${err.path}`, 400, {
      field: err.path,
      value: err.value,
    });
  }

  // Zod Validation Error
  if (err instanceof ZodError) {
    const details = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    return errorResponse(res, 'Request validation failed', 400, details);
  }

  // Generic / unknown error
  const statusCode = err.statusCode || err.status || 500;
  const message =
    process.env.NODE_ENV === 'production' && statusCode === 500
      ? 'Internal server error'
      : err.message || 'Internal server error';

  return errorResponse(res, message, statusCode);
};

module.exports = errorHandler;
