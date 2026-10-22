'use client';

export function CardSkeleton() {
  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-5 animate-pulse">
      <div className="flex justify-between items-center mb-4">
        <div className="h-4 bg-gray-800 rounded w-24"></div>
        <div className="h-8 w-8 bg-gray-800 rounded-lg"></div>
      </div>
      <div className="h-8 bg-gray-800 rounded w-16 mb-2"></div>
      <div className="h-3 bg-gray-800 rounded w-32"></div>
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 5 }) {
  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-xl overflow-hidden animate-pulse">
      <div className="p-4 border-b border-gray-800 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-4 bg-gray-800 rounded flex-1"></div>
        ))}
      </div>
      <div className="divide-y divide-gray-800/60">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="p-4 flex gap-4">
            {Array.from({ length: cols }).map((_, c) => (
              <div key={c} className="h-4 bg-gray-800/70 rounded flex-1"></div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
      <TableSkeleton rows={4} cols={4} />
    </div>
  );
}
