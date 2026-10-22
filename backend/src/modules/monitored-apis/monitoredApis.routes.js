const { Router } = require('express');
const {
  createApi,
  getAllApis,
  getApiById,
  updateApi,
  deleteApi,
  toggleApi,
} = require('./monitoredApis.controller');

const router = Router();

// POST   /api/v1/monitored-apis        → create
router.post('/', createApi);

// GET    /api/v1/monitored-apis        → list all (with filters)
router.get('/', getAllApis);

// GET    /api/v1/monitored-apis/:id    → get one
router.get('/:id', getApiById);

// PUT    /api/v1/monitored-apis/:id    → update
router.put('/:id', updateApi);

// DELETE /api/v1/monitored-apis/:id   → delete
router.delete('/:id', deleteApi);

// PATCH  /api/v1/monitored-apis/:id/toggle → flip enabled
router.patch('/:id/toggle', toggleApi);

module.exports = router;
