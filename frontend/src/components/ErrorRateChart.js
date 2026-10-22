'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export default function ErrorRateChart({ data = [] }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-gray-500">
        No check telemetry available
      </div>
    );
  }

  // Aggregate checks by status code group
  const grouped = {
    '2xx Success': 0,
    '4xx Client Error': 0,
    '5xx Server Error': 0,
    'Network/Timeout': 0,
  };

  data.forEach((check) => {
    const code = check.statusCode;
    if (code >= 200 && code < 300) {
      grouped['2xx Success']++;
    } else if (code >= 400 && code < 500) {
      grouped['4xx Client Error']++;
    } else if (code >= 500) {
      grouped['5xx Server Error']++;
    } else {
      grouped['Network/Timeout']++;
    }
  });

  const chartData = [
    { name: '2xx', count: grouped['2xx Success'], fill: '#10b981' },
    { name: '4xx', count: grouped['4xx Client Error'], fill: '#f59e0b' },
    { name: '5xx', count: grouped['5xx Server Error'], fill: '#ef4444' },
    { name: 'Errors', count: grouped['Network/Timeout'], fill: '#8b5cf6' },
  ];

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-gray-900 border border-gray-700 p-2.5 rounded-lg shadow-lg text-xs">
          <p className="text-gray-300 font-medium">{payload[0].payload.name} Responses</p>
          <p className="text-white font-bold">{payload[0].value} checks</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
          <XAxis
            dataKey="name"
            stroke="#6b7280"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: '#374151' }}
          />
          <YAxis
            stroke="#6b7280"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
