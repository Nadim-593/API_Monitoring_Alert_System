import axios from 'axios';

const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:5000/api/v1';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ─── Response Interceptor ─────────────────────────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    let message = 'An unexpected error occurred';
    if (error.response?.data?.message) {
      message = error.response.data.message;
    } else if (error.message) {
      message = error.message;
    }
    return Promise.reject(new Error(message));
  }
);

// ─── API Client Methods ───────────────────────────────────────────────────────

/** Health Check */
export async function getHealth() {
  const res = await api.get('/health');
  return res.data;
}

/** Dashboard Summary KPI */
export async function getMonitoringSummary() {
  const res = await api.get('/monitoring/summary');
  return res.data;
}

/** Check Telemetry History */
export async function getMonitoringHistory(params = {}) {
  const res = await api.get('/monitoring/history', { params });
  return res.data;
}

/** Monitored APIs */
export async function getMonitoredApis(params = {}) {
  const res = await api.get('/monitored-apis', { params });
  return res.data;
}

export async function getMonitoredApi(id) {
  const res = await api.get(`/monitored-apis/${id}`);
  return res.data;
}

export async function createMonitoredApi(payload) {
  const res = await api.post('/monitored-apis', payload);
  return res.data;
}

export async function updateMonitoredApi(id, payload) {
  const res = await api.put(`/monitored-apis/${id}`, payload);
  return res.data;
}

export async function deleteMonitoredApi(id) {
  const res = await api.delete(`/monitored-apis/${id}`);
  return res.data;
}

export async function toggleMonitoredApi(id) {
  const res = await api.patch(`/monitored-apis/${id}/toggle`);
  return res.data;
}

/** Alerts */
export async function getAlerts(params = {}) {
  const res = await api.get('/alerts', { params });
  return res.data;
}

export async function getAlert(id) {
  const res = await api.get(`/alerts/${id}`);
  return res.data;
}

export async function patchAlert(id, status) {
  const res = await api.patch(`/alerts/${id}`, { status });
  return res.data;
}

export async function acknowledgeAlert(id) {
  const res = await api.patch(`/alerts/${id}/acknowledge`);
  return res.data;
}

export async function resolveAlert(id) {
  const res = await api.patch(`/alerts/${id}/resolve`);
  return res.data;
}

/** Ingest / Trigger Manual Check */
export async function triggerManualCheck(payload) {
  const res = await api.post('/monitor', payload);
  return res.data;
}

export default api;
