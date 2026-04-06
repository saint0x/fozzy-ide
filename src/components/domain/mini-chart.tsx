import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface DataPoint {
  timestamp: string;
  value: number;
}

interface MiniChartProps {
  data: DataPoint[];
  color?: string;
  height?: number;
  showLabels?: boolean;
  className?: string;
}

export function MiniChart({
  data,
  color = '#3b82f6',
  height = 120,
  showLabels = true,
  className,
}: MiniChartProps) {
  const viewBoxWidth = 400;
  const viewBoxHeight = height;
  const padding = { top: 8, right: 8, bottom: 8, left: 8 };

  const { points, polyline, areaPath, min, max, avg, current } = useMemo(() => {
    if (data.length === 0) {
      return { points: [], polyline: '', areaPath: '', min: 0, max: 0, avg: 0, current: 0 };
    }

    const values = data.map((d) => d.value);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const avgVal = values.reduce((a, b) => a + b, 0) / values.length;
    const range = maxVal - minVal || 1;

    const chartWidth = viewBoxWidth - padding.left - padding.right;
    const chartHeight = viewBoxHeight - padding.top - padding.bottom;

    const pts = data.map((d, i) => {
      const x = padding.left + (i / Math.max(data.length - 1, 1)) * chartWidth;
      const y = padding.top + chartHeight - ((d.value - minVal) / range) * chartHeight;
      return { x, y };
    });

    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

    const area = [
      line,
      `L${pts[pts.length - 1].x},${viewBoxHeight - padding.bottom}`,
      `L${pts[0].x},${viewBoxHeight - padding.bottom}`,
      'Z',
    ].join(' ');

    return {
      points: pts,
      polyline: line,
      areaPath: area,
      min: minVal,
      max: maxVal,
      avg: avgVal,
      current: values[values.length - 1],
    };
  }, [data, viewBoxWidth, viewBoxHeight, padding.top, padding.right, padding.bottom, padding.left]);

  const gradientId = useMemo(
    () => `chart-gradient-${Math.random().toString(36).slice(2, 9)}`,
    [],
  );

  if (data.length === 0) {
    return (
      <div
        className={cn('flex items-center justify-center text-text-muted text-xs', className)}
        style={{ height }}
      >
        No data
      </div>
    );
  }

  const formatValue = (v: number) => (v >= 1 ? v.toFixed(1) : v.toFixed(3));

  return (
    <div className={cn('relative w-full', className)}>
      <svg
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        <path d={areaPath} fill={`url(#${gradientId})`} />

        <path
          d={polyline}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {points.length > 0 && (
          <circle
            cx={points[points.length - 1].x}
            cy={points[points.length - 1].y}
            r={3}
            fill={color}
            strokeWidth={1.5}
            stroke="var(--color-bg-secondary)"
          />
        )}
      </svg>

      {showLabels && (
        <div className="flex items-center justify-between mt-1.5 px-1">
          <span className="text-[10px] text-text-muted">
            min <span className="text-text-tertiary">{formatValue(min)}</span>
          </span>
          <span className="text-[10px] text-text-muted">
            avg <span className="text-text-tertiary">{formatValue(avg)}</span>
          </span>
          <span className="text-[10px] text-text-muted">
            max <span className="text-text-tertiary">{formatValue(max)}</span>
          </span>
          <span className="text-[10px] text-text-muted">
            now <span className="text-text-secondary font-medium">{formatValue(current)}</span>
          </span>
        </div>
      )}
    </div>
  );
}
