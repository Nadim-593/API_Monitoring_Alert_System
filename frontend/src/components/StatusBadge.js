'use client';

export default function StatusBadge({ status }) {
  const st = (status || '').toLowerCase();

  const styles = {
    open: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    acknowledged: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    resolved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    enabled: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    disabled: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
    healthy: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    degraded: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    failing: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    failed: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  };

  const currentStyle = styles[st] || 'bg-gray-800 text-gray-300 border-gray-700';

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize ${currentStyle}`}
    >
      {st}
    </span>
  );
}
