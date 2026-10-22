'use client';

export default function SeverityBadge({ severity }) {
  const sev = (severity || 'low').toLowerCase();

  const styles = {
    critical: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    high: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    warning: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    medium: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    low: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  };

  const currentStyle = styles[sev] || styles.low;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border uppercase tracking-wider ${currentStyle}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      {sev}
    </span>
  );
}
