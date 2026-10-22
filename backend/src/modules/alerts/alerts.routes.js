const { Router } = require('express');
const {
  getAlerts,
  getAlertById,
  patchAlert,
  acknowledgeAlertHandler,
  resolveAlertHandler,
} = require('./alerts.controller');

const router = Router();

// GET   /api/v1/alerts                 → list alerts (active by default, filterable)
router.get('/', getAlerts);

// GET   /api/v1/alerts/:id             → get alert details
router.get('/:id', getAlertById);

// PATCH /api/v1/alerts/:id             → acknowledge or resolve (status in body)
router.patch('/:id', patchAlert);

// PATCH /api/v1/alerts/:id/acknowledge → convenience acknowledge
router.patch('/:id/acknowledge', acknowledgeAlertHandler);

// PATCH /api/v1/alerts/:id/resolve     → convenience resolve
router.patch('/:id/resolve', resolveAlertHandler);

module.exports = router;
