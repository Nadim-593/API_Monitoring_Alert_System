const { errorResponse } = require('../utils/apiResponse');

/**
 * 404 Not Found handler.
 * Mount this AFTER all routes to catch unmatched requests.
 */
const notFound = (req, res) => {
  return errorResponse(
    res,
    `Route not found: ${req.method} ${req.originalUrl}`,
    404
  );
};

module.exports = notFound;
