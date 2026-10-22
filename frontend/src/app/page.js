'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  Server,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ShieldAlert,
  Zap,
} from 'lucide-react';
import AppShell from '../components/AppShell';
import SummaryCard from '../components/SummaryCard';
import SeverityBadge from '../components/SeverityBadge';
import StatusBadge from '../components/StatusBadge';
import LatencyChart from '../components/LatencyChart';
import ErrorRateChart from '../components/ErrorRateChart';
import EmptyState from '../components/EmptyState';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { getMonitoringSummary, getMonitoringHistory } from '../lib/api';

export default function DashboardPage() {
  const [summary, setSummary] = useState(null);
  const [recentChecks, setRecentChecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      setError(null);
      const [summaryRes, historyRes] = await Promise.all([
        getMonitoringSummary(),
        getMonitoringHistory({ limit: 30 }),
      ]);

      if (summaryRes.success) {
        setSummary(summaryRes.data);
      }
      if (historyRes.success) {
        setRecentChecks(historyRes.data.checks || []);
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      setError(err.message || 'Unable to connect to PulseWatch AI backend');
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(false), 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <AppShell title="System Overview" subtitle="Real-time API observability & telemetry">
        <LoadingSkeleton />
      </AppShell>
    );
  }

  const apis = summary?.apis || { total: 0, active: 0, inactive: 0 };
  const metrics24h = summary?.metrics24h || {
    totalChecks: 0,
    successfulChecks: 0,
    failedChecks: 0,
    uptimePercent: 100,
    avgResponseTimeMs: 0,
  };
  const alerts = summary?.alerts || { totalActive: 0, bySeverity: {}, recent: [] };

  return (
    <AppShell
      title="System Overview"
      subtitle="Real-time API health, telemetry, and automated diagnostic intelligence"
      onRefresh={() => fetchData(true)}
      isRefreshing={refreshing}
    >
      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 text-rose-400" />
            <span className="text-sm font-medium">{error}</span>
          </div>
          <button
            onClick={() => fetchData(true)}
            className="text-xs px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 font-medium transition-colors"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <SummaryCard
          title="Monitored APIs"
          value={apis.total}
          subtitle={`${apis.active} active • ${apis.inactive} paused`}
          icon={Server}
          color="indigo"
        />
        <SummaryCard
          title="24h Service Uptime"
          value={`${metrics24h.uptimePercent}%`}
          subtitle={`${metrics24h.successfulChecks.toLocaleString()} of ${metrics24h.totalChecks.toLocaleString()} checks`}
          icon={CheckCircle2}
          color={metrics24h.uptimePercent >= 99 ? 'emerald' : 'amber'}
        />
        <SummaryCard
          title="Avg Latency (24h)"
          value={`${metrics24h.avgResponseTimeMs} ms`}
          subtitle={
            metrics24h.avgResponseTimeMs > 2000
              ? 'Exceeds warning threshold'
              : 'Within healthy bounds (<2000ms)'
          }
          icon={Clock}
          color={metrics24h.avgResponseTimeMs > 2000 ? 'amber' : 'blue'}
        />
        <SummaryCard
          title="Active Alerts"
          value={alerts.totalActive}
          subtitle={`${alerts.bySeverity.critical || 0} critical • ${alerts.bySeverity.high || 0} high`}
          icon={ShieldAlert}
          color={alerts.totalActive > 0 ? 'rose' : 'emerald'}
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Latency Trend Area Chart */}
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Response Latency Trend</h2>
              <p className="text-xs text-gray-400">Recent check duration across monitored APIs</p>
            </div>
            <span className="text-xs font-medium text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
              Live Telemetry
            </span>
          </div>
          <LatencyChart data={recentChecks.slice().reverse()} />
        </div>

        {/* Status Distribution Bar Chart */}
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Response Status Distribution</h2>
              <p className="text-xs text-gray-400">Breakdown of recent HTTP status codes</p>
            </div>
            <span className="text-xs font-medium text-gray-400 bg-gray-800 px-2 py-0.5 rounded">
              Last {recentChecks.length} checks
            </span>
          </div>
          <ErrorRateChart data={recentChecks} />
        </div>
      </div>

      {/* Recent Alerts Section */}
      <div className="bg-gray-900/60 border border-gray-800 rounded-xl overflow-hidden shadow-sm mb-8">
        <div className="p-5 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Recent Active Anomalies & Alerts</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Diagnosed issues requiring attention or triage
            </p>
          </div>
          <Link
            href="/alerts"
            className="text-xs font-medium text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
          >
            View all alerts <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {alerts.recent && alerts.recent.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-gray-900 text-xs font-medium text-gray-400 uppercase tracking-wider border-b border-gray-800">
                <tr>
                  <th className="px-5 py-3">API Name</th>
                  <th className="px-5 py-3">Severity</th>
                  <th className="px-5 py-3">Summary</th>
                  <th className="px-5 py-3">Analysis Type</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {alerts.recent.map((alert) => (
                  <tr key={alert._id} className="hover:bg-gray-800/40 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-white">{alert.apiName}</td>
                    <td className="px-5 py-3.5">
                      <SeverityBadge severity={alert.severity} />
                    </td>
                    <td className="px-5 py-3.5 max-w-md truncate text-gray-300">
                      {alert.summary}
                    </td>
                    <td className="px-5 py-3.5">
                      {alert.aiGenerated ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                          <Zap className="w-3 h-3" /> Mistral AI
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400 bg-gray-800 px-2 py-0.5 rounded">
                          Deterministic
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={alert.status} />
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link
                        href={`/alerts/${alert._id}`}
                        className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        Inspect →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={CheckCircle2}
            title="All systems operational"
            description="No active anomalies detected across your monitored endpoints."
          />
        )}
      </div>
    </AppShell>
  );
}
