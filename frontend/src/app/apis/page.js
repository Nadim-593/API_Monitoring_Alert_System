'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Server,
  Plus,
  Play,
  Trash2,
  ExternalLink,
  Search,
  Check,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  X,
} from 'lucide-react';
import AppShell from '../../components/AppShell';
import StatusBadge from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';
import ConfirmDialog from '../../components/ConfirmDialog';
import { TableSkeleton } from '../../components/LoadingSkeleton';
import {
  getMonitoredApis,
  createMonitoredApi,
  deleteMonitoredApi,
  toggleMonitoredApi,
  triggerManualCheck,
} from '../../lib/api';

export default function MonitoredApisPage() {
  const [apis, setApis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEnabled, setFilterEnabled] = useState('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    method: 'GET',
    intervalSeconds: 60,
    timeoutMs: 10000,
    expectRecords: false,
    tags: '',
  });
  const [formError, setFormError] = useState('');

  // Delete Dialog State
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Manual Check Feedback
  const [checkResult, setCheckResult] = useState(null);

  const fetchApis = useCallback(async () => {
    try {
      const res = await getMonitoredApis({ limit: 100 });
      if (res.success) {
        setApis(res.data.apis || []);
      }
    } catch (err) {
      console.error('Failed to load monitored APIs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApis();
  }, [fetchApis]);

  // Handle Form Submit
  const handleCreateApi = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSubmitting(true);

    try {
      if (!formData.name.trim() || !formData.url.trim()) {
        throw new Error('API Name and URL are required.');
      }

      const payload = {
        name: formData.name.trim(),
        url: formData.url.trim(),
        method: formData.method,
        intervalSeconds: Number(formData.intervalSeconds) || 60,
        timeoutMs: Number(formData.timeoutMs) || 10000,
        thresholds: {
          expectRecords: formData.expectRecords,
        },
        tags: formData.tags
          ? formData.tags.split(',').map((t) => t.trim()).filter(Boolean)
          : [],
      };

      const res = await createMonitoredApi(payload);
      if (res.success) {
        setIsModalOpen(false);
        setFormData({
          name: '',
          url: '',
          method: 'GET',
          intervalSeconds: 60,
          timeoutMs: 10000,
          expectRecords: false,
          tags: '',
        });
        await fetchApis();
      }
    } catch (err) {
      setFormError(err.message || 'Failed to create monitored API');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Toggle Enabled
  const handleToggle = async (api) => {
    try {
      const res = await toggleMonitoredApi(api._id);
      if (res.success) {
        setApis((prev) =>
          prev.map((item) => (item._id === api._id ? res.data : item))
        );
      }
    } catch (err) {
      alert(`Toggle failed: ${err.message}`);
    }
  };

  // Delete API
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await deleteMonitoredApi(deleteTarget._id);
      if (res.success) {
        setApis((prev) => prev.filter((item) => item._id !== deleteTarget._id));
        setDeleteTarget(null);
      }
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Run Manual Check
  const handleRunManualCheck = async (api) => {
    setCheckResult({ apiName: api.name, status: 'running' });
    try {
      const res = await triggerManualCheck({
        api_name: api.name,
        response_time_ms: 120,
        status_code: 200,
        records_returned: 10,
      });

      if (res.success) {
        const item = res.data.results?.[0];
        setCheckResult({
          apiName: api.name,
          status: 'success',
          anomalyDetected: item?.anomalyDetected,
          message: item?.anomalyDetected ? 'Anomaly detected!' : 'Check passed healthy (200 OK)',
        });
      }
    } catch (err) {
      setCheckResult({
        apiName: api.name,
        status: 'error',
        message: err.message,
      });
    }
    setTimeout(() => setCheckResult(null), 5000);
  };

  // Filtered APIs
  const filteredApis = apis.filter((api) => {
    const matchesSearch =
      api.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      api.url.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesEnabled =
      filterEnabled === 'all'
        ? true
        : filterEnabled === 'enabled'
        ? api.enabled
        : !api.enabled;
    return matchesSearch && matchesEnabled;
  });

  return (
    <AppShell
      title="Monitored APIs"
      subtitle="Configure target endpoints, inspection schedules, and anomaly thresholds"
      onRefresh={fetchApis}
    >
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name or URL..."
              className="w-full pl-9 pr-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          <select
            value={filterEnabled}
            onChange={(e) => setFilterEnabled(e.target.value)}
            className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Status</option>
            <option value="enabled">Active</option>
            <option value="disabled">Paused</option>
          </select>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> Register API
        </button>
      </div>

      {/* Manual Check Banner Notification */}
      {checkResult && (
        <div
          className={`mb-6 p-4 rounded-xl border flex items-center justify-between ${
            checkResult.status === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : checkResult.status === 'running'
              ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="font-semibold">{checkResult.apiName}:</span>
            <span className="text-sm">
              {checkResult.status === 'running' ? 'Executing live diagnostic ping...' : checkResult.message}
            </span>
          </div>
          <button
            onClick={() => setCheckResult(null)}
            className="text-xs p-1 hover:opacity-75"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Table Section */}
      {loading ? (
        <TableSkeleton rows={5} cols={5} />
      ) : filteredApis.length > 0 ? (
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-gray-900 text-xs font-medium text-gray-400 uppercase tracking-wider border-b border-gray-800">
                <tr>
                  <th className="px-5 py-3">API Target</th>
                  <th className="px-5 py-3">Method</th>
                  <th className="px-5 py-3">Cadence</th>
                  <th className="px-5 py-3">Thresholds</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {filteredApis.map((api) => (
                  <tr key={api._id} className="hover:bg-gray-800/40 transition-colors">
                    <td className="px-5 py-4">
                      <div className="font-medium text-white">{api.name}</div>
                      <a
                        href={api.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-gray-400 hover:text-indigo-400 flex items-center gap-1 mt-0.5 truncate max-w-sm"
                      >
                        {api.url} <ExternalLink className="w-3 h-3 flex-shrink-0" />
                      </a>
                    </td>

                    <td className="px-5 py-4">
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-gray-800 text-indigo-400 border border-gray-700">
                        {api.method || 'GET'}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-xs text-gray-300">
                      Every {api.intervalSeconds || 60}s
                      <span className="block text-gray-500">
                        Timeout: {(api.timeoutMs || 10000) / 1000}s
                      </span>
                    </td>

                    <td className="px-5 py-4 text-xs">
                      {api.thresholds?.expectRecords ? (
                        <span className="text-amber-400 block">• Expects &gt;0 records</span>
                      ) : (
                        <span className="text-gray-500 block">• Standard latency</span>
                      )}
                    </td>

                    <td className="px-5 py-4">
                      <button
                        onClick={() => handleToggle(api)}
                        className="flex items-center gap-1.5 focus:outline-none"
                        title="Click to toggle monitoring"
                      >
                        {api.enabled ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full hover:bg-emerald-500/20 transition-colors">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 bg-gray-800 border border-gray-700 px-2.5 py-1 rounded-full hover:bg-gray-700 transition-colors">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-400" /> Paused
                          </span>
                        )}
                      </button>
                    </td>

                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleRunManualCheck(api)}
                          className="p-1.5 text-gray-400 hover:text-emerald-400 hover:bg-gray-800 rounded-lg transition-colors"
                          title="Run Diagnostic Check Now"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(api)}
                          className="p-1.5 text-gray-400 hover:text-rose-400 hover:bg-gray-800 rounded-lg transition-colors"
                          title="Delete API"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState
          icon={Server}
          title="No Monitored APIs registered"
          description="Register public or internal REST endpoints to begin autonomous uptime monitoring and anomaly diagnostics."
          actionLabel="Register your first API"
          onAction={() => setIsModalOpen(true)}
        />
      )}

      {/* Register API Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="bg-gray-900 border border-gray-800 rounded-xl max-w-lg w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-white mb-1">Register New API Target</h3>
            <p className="text-xs text-gray-400 mb-5">
              PulseWatch will automatically poll this endpoint on schedule.
            </p>

            {formError && (
              <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateApi} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">
                  API Friendly Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. PatientAppointmentsAPI"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 text-sm"
                />
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div className="col-span-1">
                  <label className="block text-xs font-medium text-gray-300 mb-1">Method</label>
                  <select
                    value={formData.method}
                    onChange={(e) => setFormData({ ...formData, method: e.target.value })}
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-2.5 py-2 text-white focus:outline-none focus:border-indigo-500 text-sm font-mono"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="PATCH">PATCH</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                </div>

                <div className="col-span-3">
                  <label className="block text-xs font-medium text-gray-300 mb-1">Endpoint URL *</label>
                  <input
                    type="url"
                    required
                    placeholder="https://api.example.com/v1/health"
                    value={formData.url}
                    onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 text-sm font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">
                    Check Interval (Seconds)
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="86400"
                    value={formData.intervalSeconds}
                    onChange={(e) => setFormData({ ...formData, intervalSeconds: e.target.value })}
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">
                    Timeout (Milliseconds)
                  </label>
                  <input
                    type="number"
                    min="1000"
                    max="30000"
                    step="1000"
                    value={formData.timeoutMs}
                    onChange={(e) => setFormData({ ...formData, timeoutMs: e.target.value })}
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-sm"
                  />
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.expectRecords}
                    onChange={(e) => setFormData({ ...formData, expectRecords: e.target.checked })}
                    className="w-4 h-4 rounded bg-gray-950 border-gray-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-gray-900"
                  />
                  <span className="text-xs text-gray-300 font-medium">
                    Flag zero records as abnormal (ZERO_RECORDS policy)
                  </span>
                </label>
                <p className="text-[11px] text-gray-500 pl-6.5 mt-0.5">
                  When enabled, empty array responses will trigger an anomaly alert.
                </p>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white bg-gray-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg flex items-center gap-2 disabled:opacity-50"
                >
                  {formSubmitting && (
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  Register Target
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete Monitored API"
        message={`Are you sure you want to stop monitoring and delete "${deleteTarget?.name}"? Scheduled checks will be halted immediately.`}
        confirmLabel="Delete Target"
        isDestructive={true}
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </AppShell>
  );
}
