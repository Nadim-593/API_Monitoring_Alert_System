/**
 * Wraps an async route handler to automatically forward errors to next().
 * Avoids repetitive try/catch blocks in controllers.
 *
 * @param {Function} fn - Async express route handler
 * @returns {Function} Express middleware
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
