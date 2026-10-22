'use client';

import { Menu, RefreshCw, ShieldCheck, AlertCircle } from 'lucide-react';

export default function Header({
  title,
  subtitle,
  onMenuClick,
  onRefresh,
  isRefreshing,
  healthStatus,
}) {
  return (
    <header className="h-16 bg-gray-950/80 backdrop-blur-md border-b border-gray-800/80 sticky top-0 z-30 px-4 md:px-8 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="md:hidden text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-900 focus:outline-none"
          aria-label="Open sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">{title}</h1>
          {subtitle && <p className="text-xs text-gray-400 hidden sm:block">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Backend health status badge */}
        <div
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
            healthStatus?.database === 'connected'
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : healthStatus
              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
              : 'bg-gray-800 text-gray-400 border-gray-700'
          }`}
        >
          {healthStatus?.database === 'connected' ? (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Backend Connected</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>Checking System...</span>
            </>
          )}
        </div>

        {/* Refresh button */}
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-300 bg-gray-900 border border-gray-800 hover:bg-gray-800 hover:text-white transition-colors disabled:opacity-50"
            title="Refresh dashboard metrics"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        )}
      </div>
    </header>
  );
}
