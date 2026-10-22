'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  AlertTriangle,
  Zap,
  ShieldAlert,
  Clock,
  CheckCircle2,
  CheckCheck,
  Server,
  Layers,
  Activity,
  FileText,
} from 'lucide-react';
import AppShell from '../../../components/AppShell';
import SeverityBadge from '../../../components/SeverityBadge';
import StatusBadge from '../../../components/StatusBadge';
import ConfirmDialog from '../../../components/ConfirmDialog';
import LoadingSkeleton from '../../../components/LoadingSkeleton';
import { getAlert, acknowledgeAlert, resolveAlert } from '../../../lib/api';

export default function AlertDetailPage() {
  const { id } = useParams();
  const router = useRouter();

  const [alert, setAlert] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Mutation states
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [showResolveConfirm, setShowResolveConfirm] = useState(false);

  const fetchAlertDetail = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      const res = await getAlert(id);
      if (res.success) {
        setAlert(res.data);
      }
    } catch (err) {
      console.error('Failed to load alert:', err);
      setError(err.message || 'Alert not found');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchAlertDetail();
  }, [fetchAlertDetail]);

  const handleAcknowledge = async () => {
    setActionLoading(true);
    try {
      const res = await acknowledgeAlert(id);
      if (res.success) {
        setAlert(res.data);
        setFeedback({ type: 'success', message: 'Alert successfully marked as Acknowledged.' });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setActionLoading(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  const handleResolve = async () => {
    setActionLoading(true);
    try {
      const res = await resolveAlert(id);
      if (res.success) {
        setAlert(res.data);
        setShowResolveConfirm(false);
        setFeedback({ type: 'success', message: 'Alert marked as Resolved.' });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setActionLoading(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  if (loading) {
    return (
      <AppShell title="Alert Diagnostic Details">
        <LoadingSkeleton />
      </AppShell>
    );
  }

  if (error || !alert) {
    return (
      <AppShell title="Alert Not Found">
        <div className="text-center py-12">
          <AlertTriangle className="w-12 h-12 text-rose-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-white mb-2">Unable to Load Alert</h2>
          <p className="text-sm text-gray-400 mb-6">{error || 'Alert ID does not exist.'}</p>
          <Link
            href="/alerts"
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Back to Alerts
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={`Incident: ${alert.apiName}`}
      subtitle="Comprehensive AI root-cause diagnostics, impact analysis, and remediation steps"
      onRefresh={fetchAlertDetail}
    >
      {/* Back button and Status Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <Link
          href="/alerts"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Alerts List
        </Link>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          {alert.status === 'open' && (
            <button
              onClick={handleAcknowledge}
              disabled={actionLoading}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
            >
              Acknowledge Incident
            </button>
          )}

          {alert.status !== 'resolved' && (
            <button
              onClick={() => setShowResolveConfirm(true)}
              disabled={actionLoading}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition-colors shadow-sm disabled:opacity-50"
            >
              Resolve Incident
            </button>
          )}
        </div>
      </div>

      {/* Banner Feedback */}
      {feedback && (
        <div
          className={`mb-6 p-4 rounded-xl border text-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* Primary Overview Card */}
      <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-6 mb-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-gray-800">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-white tracking-tight">{alert.apiName}</h2>
              <SeverityBadge severity={alert.severity} />
              <StatusBadge status={alert.status} />
            </div>
            <p className="text-xs text-gray-400 mt-1 font-mono">
              Fingerprint: {alert.fingerprint}
            </p>
          </div>

          <div className="flex items-center gap-6 text-xs text-gray-400">
            <div>
              <span className="block text-gray-500">First Detected</span>
              <span className="font-medium text-gray-300">
                {new Date(alert.createdAt).toLocaleString()}
              </span>
            </div>
            <div>
              <span className="block text-gray-500">Last Occurrence</span>
              <span className="font-medium text-gray-300">
                {new Date(alert.lastSeenAt || alert.createdAt).toLocaleString()}
              </span>
            </div>
            <div>
              <span className="block text-gray-500">Occurrences</span>
              <span className="font-mono text-sm font-bold text-indigo-400">
                {alert.occurrenceCount || 1}
              </span>
            </div>
          </div>
        </div>

        {/* Reason Codes Badges */}
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 font-medium">Triggered Anomaly Codes:</span>
          {(alert.reasonCodes || []).map((code) => (
            <span
              key={code}
              className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-gray-800 text-indigo-300 border border-gray-700"
            >
              {code}
            </span>
          ))}
        </div>
      </div>

      {/* AI Diagnostic Report Card */}
      <div className="bg-gradient-to-b from-gray-900/90 to-gray-950 border border-indigo-500/30 rounded-xl p-6 mb-6 shadow-lg relative overflow-hidden">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Automated Diagnostic Analysis
                {alert.aiGenerated ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-medium border border-purple-500/30">
                    Mistral AI Engine
                  </span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 font-medium border border-gray-700">
                    Rule-Based Fallback
                  </span>
                )}
              </h3>
              <p className="text-xs text-gray-400">
                Synthesis of HTTP status, latency telemetry, and historical baselines
              </p>
            </div>
          </div>

          <span className="text-xs font-mono text-gray-500 hidden sm:inline">
            Status: {alert.aiGenerationStatus || 'completed'}
          </span>
        </div>

        <div className="space-y-6">
          {/* Summary */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-indigo-400 mb-1.5 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> Diagnostic Summary
            </h4>
            <p className="text-sm text-gray-200 leading-relaxed bg-gray-950/60 p-4 rounded-lg border border-gray-800/80">
              {alert.summary}
            </p>
          </div>

          {/* Likely Root Cause */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-1.5 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> Likely Root Cause & Factors
            </h4>
            <p className="text-sm text-gray-200 leading-relaxed bg-gray-950/60 p-4 rounded-lg border border-gray-800/80">
              {alert.possibleCause || 'Underlying root cause undetermined based on available evidence.'}
            </p>
          </div>

          {/* Business Impact */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-rose-400 mb-1.5 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5" /> Operational & Business Impact
            </h4>
            <p className="text-sm text-gray-200 leading-relaxed bg-gray-950/60 p-4 rounded-lg border border-gray-800/80">
              {alert.businessImpact || 'Operational impact not documented.'}
            </p>
          </div>

          {/* Recommended Action Checklist */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-1.5 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Recommended Remediation Steps
            </h4>
            <div className="bg-gray-950/60 p-4 rounded-lg border border-gray-800/80">
              <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-line">
                {alert.recommendedAction || 'No remediation actions specified.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Telemetry Snapshot Card */}
      {alert.metricsSnapshot && Object.keys(alert.metricsSnapshot).length > 0 && (
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-400" />
            Telemetry Metrics at Incident Time
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="bg-gray-950 p-3.5 rounded-lg border border-gray-800">
              <span className="text-gray-500 block mb-1">HTTP Status Code</span>
              <span className="text-base font-mono font-bold text-white">
                {alert.metricsSnapshot.statusCode ?? 'N/A'}
              </span>
            </div>

            <div className="bg-gray-950 p-3.5 rounded-lg border border-gray-800">
              <span className="text-gray-500 block mb-1">Response Duration</span>
              <span className="text-base font-mono font-bold text-white">
                {alert.metricsSnapshot.responseTimeMs !== undefined
                  ? `${alert.metricsSnapshot.responseTimeMs} ms`
                  : 'N/A'}
              </span>
            </div>

            <div className="bg-gray-950 p-3.5 rounded-lg border border-gray-800">
              <span className="text-gray-500 block mb-1">Records Returned</span>
              <span className="text-base font-mono font-bold text-white">
                {alert.metricsSnapshot.recordsReturned ?? 'N/A'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog for Resolve */}
      <ConfirmDialog
        isOpen={showResolveConfirm}
        title="Resolve Incident Alert"
        message="Resolving this incident marks it as permanently closed in the lifecycle. Are you sure the underlying service is healthy?"
        confirmLabel="Confirm Resolution"
        isLoading={actionLoading}
        onConfirm={handleResolve}
        onCancel={() => setShowResolveConfirm(false)}
      />
    </AppShell>
  );
}
