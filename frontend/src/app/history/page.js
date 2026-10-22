'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  History,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Calendar,
} from 'lucide-react';
import AppShell from '../../components/AppShell';
import StatusBadge from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';
import { TableSkeleton } from '../../components/LoadingSkeleton';
import { getMonitoringHistory } from '../../lib/api';

export default function HistoryPage() {
  const [checks, setChecks] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [loading, setLoading] = useState(true);

  // Filters
  const [apiName, setApiName] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const fetchHistory = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: 20,
      };
      if (apiName.trim()) params.api_name = apiName.trim();
      if (fromDate) params.from = fromDate;
      if (toDate) params.to = toDate;

      const res = await getMonitoringHistory(params);
      if (res.success) {
        setChecks(res.data.checks || []);
        setPagination(res.data.pagination || { total: 0, page: 1, limit: 20, totalPages: 1 });
      }
    } catch (err) {
      console.error('Failed to load check history:', err);
    } finally {
      setLoading(false);
    }
  }, [apiName, fromDate, toDate]);

  useEffect(() => {
    fetchHistory(1);
  }, [fetchHistory]);

  return (
    <AppShell
      title="Telemetry Check History"
      subtitle="Complete chronological audit trail of health checks and observed response metrics"
      onRefresh={() => fetchHistory(pagination.page)}
    >
      {/* Filters Bar */}
      <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={apiName}
              onChange={(e) => setApiName(e.target.value)}
              placeholder="Filter by API name..."
              className="w-full pl-9 pr-4 py-1.5 bg-gray-950 border border-gray-800 rounded-lg text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>From:</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="bg-gray-950 border border-gray-800 rounded-lg px-2.5 py-1 text-gray-300 focus:outline-none focus:border-indigo-500 text-xs"
            />
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>To:</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="bg-gray-950 border border-gray-800 rounded-lg px-2.5 py-1 text-gray-300 focus:outline-none focus:border-indigo-500 text-xs"
            />
          </div>

          {(apiName || fromDate || toDate) && (
            <button
              onClick={() => {
                setApiName('');
                setFromDate('');
                setToDate('');
              }}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="text-xs text-gray-400 font-medium">
          Total Recorded Checks: {pagination.total.toLocaleString()}
        </div>
      </div>

      {/* History Table */}
      {loading ? (
        <TableSkeleton rows={8} cols={6} />
      ) : checks.length > 0 ? (
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-gray-900 text-xs font-medium text-gray-400 uppercase tracking-wider border-b border-gray-800">
                <tr>
                  <th className="px-5 py-3">Timestamp</th>
                  <th className="px-5 py-3">API Target</th>
                  <th className="px-5 py-3">Status Code</th>
                  <th className="px-5 py-3">Latency</th>
                  <th className="px-5 py-3">Records</th>
                  <th className="px-5 py-3">Result</th>
                  <th className="px-5 py-3 text-right">Anomaly Flag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60 font-mono text-xs">
                {checks.map((chk) => (
                  <tr key={chk._id} className="hover:bg-gray-800/40 transition-colors">
                    <td className="px-5 py-3.5 text-gray-400 font-sans">
                      {new Date(chk.checkedAt).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>

                    <td className="px-5 py-3.5 font-sans font-medium text-white">
                      {chk.apiName || 'Unknown API'}
                    </td>

                    <td className="px-5 py-3.5">
                      <span
                        className={`font-semibold ${
                          chk.statusCode >= 200 && chk.statusCode < 300
                            ? 'text-emerald-400'
                            : chk.statusCode >= 400 && chk.statusCode < 500
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {chk.statusCode ?? 'ERR'}
                      </span>
                    </td>

                    <td className="px-5 py-3.5">
                      <span
                        className={`${
                          chk.responseTimeMs > 2000
                            ? 'text-amber-400 font-bold'
                            : 'text-gray-300'
                        }`}
                      >
                        {chk.responseTimeMs !== null ? `${chk.responseTimeMs} ms` : '—'}
                      </span>
                    </td>

                    <td className="px-5 py-3.5 text-gray-400">
                      {chk.recordsReturned !== null && chk.recordsReturned !== undefined
                        ? chk.recordsReturned
                        : '—'}
                    </td>

                    <td className="px-5 py-3.5 font-sans">
                      {chk.success ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400">
                          <CheckCircle className="w-3.5 h-3.5" /> Healthy
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-400">
                          <XCircle className="w-3.5 h-3.5" /> Failed
                        </span>
                      )}
                    </td>

                    <td className="px-5 py-3.5 text-right font-sans">
                      {chk.anomalyDetected ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          <AlertTriangle className="w-3 h-3" /> Anomaly
                        </span>
                      ) : (
                        <span className="text-gray-500 text-[11px]">Clean</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {pagination.totalPages > 1 && (
            <div className="p-4 border-t border-gray-800 flex items-center justify-between text-xs text-gray-400">
              <span>
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={pagination.page <= 1}
                  onClick={() => fetchHistory(pagination.page - 1)}
                  className="px-3 py-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 rounded-lg text-white transition-colors"
                >
                  Previous
                </button>
                <button
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => fetchHistory(pagination.page + 1)}
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
          icon={History}
          title="No telemetry checks recorded"
          description="Checks run on schedule or via the manual check trigger will appear here chronologically."
        />
      )}
    </AppShell>
  );
}
