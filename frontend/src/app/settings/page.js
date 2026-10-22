'use client';

import { useState, useEffect } from 'react';
import {
  Settings,
  Server,
  ShieldCheck,
  Zap,
  Activity,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Cpu,
} from 'lucide-react';
import AppShell from '../../components/AppShell';
import { getHealth } from '../../lib/api';

export default function SettingsPage() {
  const [healthData, setHealthData] = useState(null);
  const [testingHealth, setTestingHealth] = useState(false);
  const [pingLatency, setPingLatency] = useState(null);

  const testConnection = async () => {
    setTestingHealth(true);
    const start = performance.now();
    try {
      const res = await getHealth();
      const end = performance.now();
      setPingLatency(Math.round(end - start));
      if (res.success) {
        setHealthData(res.data);
      }
    } catch (err) {
      setHealthData({ status: 'unreachable', database: 'disconnected', error: err.message });
    } finally {
      setTestingHealth(false);
    }
  };

  useEffect(() => {
    testConnection();
  }, []);

  return (
    <AppShell
      title="System Settings & Diagnostics"
      subtitle="Backend connectivity verification, telemetry policies, and AI engine parameters"
    >
      <div className="space-y-6 max-w-4xl">
        {/* Backend Connectivity Card */}
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
                <Server className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">
                  Backend API & Database Connectivity
                </h3>
                <p className="text-xs text-gray-400">
                  Target: {process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1'}
                </p>
              </div>
            </div>

            <button
              onClick={testConnection}
              disabled={testingHealth}
              className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testingHealth ? 'animate-spin' : ''}`} />
              Test Connection
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-6 text-xs">
            <div className="bg-gray-950 p-4 rounded-lg border border-gray-800">
              <span className="text-gray-500 block mb-1">API Health Status</span>
              <span className="text-sm font-bold text-white flex items-center gap-1.5 capitalize">
                {healthData?.status === 'healthy' ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-400" /> Healthy
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-rose-400" /> {healthData?.status || 'Unknown'}
                  </>
                )}
              </span>
            </div>

            <div className="bg-gray-950 p-4 rounded-lg border border-gray-800">
              <span className="text-gray-500 block mb-1">Database State</span>
              <span className="text-sm font-bold text-white flex items-center gap-1.5 capitalize">
                {healthData?.database === 'connected' ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-400" /> Connected
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-amber-400" /> Disconnected
                  </>
                )}
              </span>
            </div>

            <div className="bg-gray-950 p-4 rounded-lg border border-gray-800">
              <span className="text-gray-500 block mb-1">Environment</span>
              <span className="text-sm font-mono font-bold text-indigo-400 uppercase">
                {healthData?.environment || 'development'}
              </span>
            </div>

            <div className="bg-gray-950 p-4 rounded-lg border border-gray-800">
              <span className="text-gray-500 block mb-1">Roundtrip Latency</span>
              <span className="text-sm font-mono font-bold text-white">
                {pingLatency !== null ? `${pingLatency} ms` : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Anomaly Detection Policies */}
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">
                Deterministic Anomaly Detection Policies
              </h3>
              <p className="text-xs text-gray-400">
                Rule-based thresholds configured in backend engine
              </p>
            </div>
          </div>

          <div className="space-y-3 text-xs text-gray-300 divide-y divide-gray-800/80">
            <div className="pt-3 flex justify-between">
              <span className="font-medium text-gray-400">Warning Latency Threshold:</span>
              <span className="font-mono text-gray-200">2,000 ms</span>
            </div>
            <div className="pt-3 flex justify-between">
              <span className="font-medium text-gray-400">Critical Latency Threshold:</span>
              <span className="font-mono text-gray-200">5,000 ms</span>
            </div>
            <div className="pt-3 flex justify-between">
              <span className="font-medium text-gray-400">HTTP 5xx Server Error Severity:</span>
              <span className="font-semibold text-rose-400 uppercase">Critical</span>
            </div>
            <div className="pt-3 flex justify-between">
              <span className="font-medium text-gray-400">HTTP 4xx Client Error Severity:</span>
              <span className="font-semibold text-amber-400 uppercase">Warning / Medium (401/403 Low)</span>
            </div>
            <div className="pt-3 flex justify-between">
              <span className="font-medium text-gray-400">SSRF Protection (Production):</span>
              <span className="font-mono text-emerald-400">Blocks localhost, 127/8, 10/8, 192.168/16</span>
            </div>
          </div>
        </div>

        {/* AI Engine Information */}
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center border border-purple-500/20">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Mistral AI Diagnostic Engine</h3>
              <p className="text-xs text-gray-400">
                Synthesis of API telemetry without hallucination
              </p>
            </div>
          </div>

          <p className="text-xs text-gray-300 leading-relaxed">
            PulseWatch AI integrates with <strong>Mistral AI</strong> (`mistral-large-latest`) to generate structured root-cause diagnostic assessments, business impact evaluations, and prioritized remediation actions. All incoming telemetry is treated strictly as untrusted observation data under strict prompt isolation.
          </p>

          <div className="mt-4 p-3.5 bg-gray-950 rounded-lg border border-gray-800 text-xs text-gray-400">
            <span className="font-semibold text-white block mb-1">Deterministic Fallback Architecture:</span>
            If Mistral AI experiences rate limits (HTTP 429), timeouts, or service interruptions, PulseWatch automatically activates its rule-based deterministic fallback engine to guarantee zero alerting downtime.
          </div>
        </div>
      </div>
    </AppShell>
  );
}
