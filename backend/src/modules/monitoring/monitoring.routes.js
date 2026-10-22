const { Router } = require('express');
const {
  processMonitorChecks,
  getCheckHistory,
  getMonitoringSummary,
} = require('./monitoring.controller');

const router = Router();

// POST /api/v1/monitor           → process single or batch checks
router.post('/', processMonitorChecks);

// GET  /api/v1/monitoring/summary → dashboard metrics and alert summary
router.get('/summary', getMonitoringSummary);

// GET  /api/v1/monitoring/history → paginated check history
router.get('/history', getCheckHistory);

module.exports = router;
