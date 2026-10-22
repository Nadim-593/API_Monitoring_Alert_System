/**
 * Send a standardized success response.
 * @param {import('express').Response} res
 * @param {*} data - Response payload
 * @param {string} [message='Success']
 * @param {number} [statusCode=200]
 */
const successResponse = (res, data, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

/**
 * Send a standardized error response.
 * @param {import('express').Response} res
 * @param {string} [message='An error occurred']
 * @param {number} [statusCode=500]
 * @param {*} [details=null]
 */
const errorResponse = (res, message = 'An error occurred', statusCode = 500, details = null) => {
  const payload = {
    success: false,
    message,
  };

  if (details !== null) {
    payload.details = details;
  }

  return res.status(statusCode).json(payload);
};

module.exports = { successResponse, errorResponse };
