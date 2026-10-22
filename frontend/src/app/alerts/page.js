'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Search,
  Filter,
  CheckCircle,
  Eye,
  CheckCheck,
  Zap,
  Clock,
  ArrowRight,
} from 'lucide-react';
import AppShell from '../../components/AppShell';
import SeverityBadge from '../../components/SeverityBadge';
import StatusBadge from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';
import { TableSkeleton } from '../../components/LoadingSkeleton';
import { getAlerts, acknowledgeAlert, resolveAlert } from '../../lib/api';

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 15, totalPages: 1 });
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState('active');
  const [severityFilter, setSeverityFilter] = useState('');
  const [apiSearch, setApiSearch] = useState('');

  // Mutation feedback
  const [actionFeedback, setActionFeedback] = useState(null);

  const fetchAlerts = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: 15,
        status: statusFilter,
      };
      if (severityFilter) params.severity = severityFilter;
      if (apiSearch.trim()) params.apiName = apiSearch.trim();

      const res = await getAlerts(params);
      if (res.success) {
        setAlerts(res.data.alerts || []);
        setPagination(res.data.pagination || { total: 0, page: 1, limit: 15, totalPages: 1 });
      }
    } catch (err) {
      console.error('Failed to load alerts:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, severityFilter, apiSearch]);

  useEffect(() => {
    fetchAlerts(1);
  }, [fetchAlerts]);

  // Handle Acknowledge
  const handleAcknowledge = async (alertId) => {
    try {
      const res = await acknowledgeAlert(alertId);
      if (res.success) {
        setActionFeedback({ type: 'success', message: 'Alert acknowledged' });
        await fetchAlerts(pagination.page);
      }
    } catch (err) {
      setActionFeedback({ type: 'error', message: err.message });
    }
    setTimeout(() => setActionFeedback(null), 4000);
  };

  // Handle Resolve
  const handleResolve = async (alertId) => {
    try {
      const res = await resolveAlert(alertId);
      if (res.success) {
        setActionFeedback({ type: 'success', message: 'Alert resolved successfully' });
        await fetchAlerts(pagination.page);
      }
    } catch (err) {
      setActionFeedback({ type: 'error', message: err.message });
    }
    setTimeout(() => setActionFeedback(null), 4000);
  };

  return (
    <AppShell
      title="Alerts Management"
      subtitle="Investigate anomalies, triage incidents, and verify AI diagnostic recommendations"
      onRefresh={() => fetchAlerts(pagination.page)}
    >
      {/* Toast Feedback */}
      {actionFeedback && (
        <div
          className={`mb-6 p-4 rounded-xl border flex items-center justify-between text-sm ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <span>{actionFeedback.message}</span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          {/* API Search */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={apiSearch}
              onChange={(e) => setApiSearch(e.target.value)}
              placeholder="Filter by API name..."
              className="w-full pl-9 pr-4 py-1.5 bg-gray-950 border border-gray-800 rounded-lg text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="active">Active Alerts (Open & Ack)</option>
            <option value="all">All Alerts (incl. Resolved)</option>
            <option value="open">Open Only</option>
            <option value="acknowledged">Acknowledged Only</option>
            <option value="resolved">Resolved Only</option>
          </select>

          {/* Severity Filter */}
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="warning">Warning</option>
            <option value="low">Low</option>
          </select>
        </div>

        <div className="text-xs text-gray-400 font-medium">
          Showing {alerts.length} of {pagination.total} incident records
        </div>
      </div>

      {/* Alerts Table */}
      {loading ? (
        <TableSkeleton rows={6} cols={6} />
      ) : alerts.length > 0 ? (
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-gray-900 text-xs font-medium text-gray-400 uppercase tracking-wider border-b border-gray-800">
                <tr>
                  <th className="px-5 py-3">API Target</th>
                  <th className="px-5 py-3">Severity</th>
                  <th className="px-5 py-3">Summary</th>
                  <th className="px-5 py-3">Analysis</th>
                  <th className="px-5 py-3">Count</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Triage Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {alerts.map((alert) => (
                  <tr key={alert._id} className="hover:bg-gray-800/40 transition-colors">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-white">{alert.apiName}</div>
                      <div className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" />
                        {alert.lastSeenAt
                          ? new Date(alert.lastSeenAt).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Just now'}
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <SeverityBadge severity={alert.severity} />
                    </td>

                    <td className="px-5 py-4 max-w-sm">
                      <p className="text-xs text-gray-200 line-clamp-2 leading-relaxed">
                        {alert.summary}
                      </p>
                    </td>

                    <td className="px-5 py-4">
                      {alert.aiGenerated ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                          <Zap className="w-3 h-3" /> Mistral AI
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-400 bg-gray-800 px-2 py-0.5 rounded">
                          Deterministic
                        </span>
                      )}
                    </td>

                    <td className="px-5 py-4">
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-gray-800/80 text-gray-300">
                        x{alert.occurrenceCount || 1}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      <StatusBadge status={alert.status} />
                    </td>

                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {alert.status === 'open' && (
                          <button
                            onClick={() => handleAcknowledge(alert._id)}
                            className="text-xs px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 rounded-lg transition-colors"
                            title="Acknowledge incident"
                          >
                            Ack
                          </button>
                        )}

                        {alert.status !== 'resolved' && (
                          <button
                            onClick={() => handleResolve(alert._id)}
                            className="text-xs px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 rounded-lg transition-colors"
                            title="Resolve incident"
                          >
                            Resolve
                          </button>
                        )}

                        <Link
                          href={`/alerts/${alert._id}`}
                          className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                          title="View Root-Cause Details"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {pagination.totalPages > 1 && (
            <div className="p-4 border-t border-gray-800 flex items-center justify-between text-xs text-gray-400">
              <span>
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={pagination.page <= 1}
                  onClick={() => fetchAlerts(pagination.page - 1)}
                  className="px-3 py-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 rounded-lg text-white transition-colors"
                >
                  Previous
                </button>
                <button
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => fetchAlerts(pagination.page + 1)}
                  className="px-3 py-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 rounded-lg text-white transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <EmptyState
          icon={AlertTriangle}
          title="No alerts match your filter"
          description="Everything is running within normal limits for the selected status and severity parameters."
        />
      )}
    </AppShell>
  );
}
