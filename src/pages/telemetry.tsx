import { useEffect, useState } from 'react';
import { useAppStore } from '@/stores/app-store';
import { useTelemetrySnapshot, useTelemetrySeries } from '@/hooks/use-data';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { MiniChart } from '@/components/domain/mini-chart';
import { cn } from '@/lib/utils';

type TimeRange = '1h' | '6h' | '24h' | '7d';

const TIME_RANGES: TimeRange[] = ['1h', '6h', '24h', '7d'];

export default function TelemetryPage() {
  const setActiveSection = useAppStore((s) => s.setActiveSection);
  const [range, setRange] = useState<TimeRange>('24h');

  useEffect(() => {
    setActiveSection('telemetry');
  }, [setActiveSection]);

  const { data: snapshot, isLoading: snapshotLoading } = useTelemetrySnapshot();
  const { data: passRateSeries } = useTelemetrySeries('passRate', range);
  const { data: latencySeries } = useTelemetrySeries('latency', range);
  const { data: memorySeries } = useTelemetrySeries('memory', range);
  const { data: throughputSeries } = useTelemetrySeries('throughput', range);

  if (snapshotLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" className="text-text-muted" />
      </div>
    );
  }

  const passRate = snapshot?.passRate ?? 0;
  const passPercent = (passRate * 100).toFixed(1);
  const avgLatency = snapshot?.avgLatency ?? 0;
  const flakeSignals = snapshot?.flakeSignals ?? 0;
  const memoryMb = snapshot?.memoryUsageMb ?? 0;
  const exploreProgress = snapshot?.exploreProgress ?? 0;
  const fuzzProgress = snapshot?.fuzzProgress ?? 0;

  return (
    <div className="flex flex-col gap-5 p-5 overflow-y-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-text-primary">Telemetry</h1>
          <Badge variant="info" dot size="sm">
            Live
          </Badge>
        </div>

        <div className="flex items-center gap-1 rounded-md border border-border-default bg-bg-secondary p-0.5">
          {TIME_RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded transition-colors duration-100',
                r === range
                  ? 'bg-bg-active text-text-primary'
                  : 'text-text-tertiary hover:text-text-secondary',
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard
          label="Pass Rate"
          value={`${passPercent}%`}
          indicator={passRate >= 0.9 ? 'success' : passRate >= 0.75 ? 'warning' : 'error'}
        />
        <StatCard label="Avg Latency" value={`${avgLatency}ms`} indicator="default" />
        <StatCard
          label="Flake Signals"
          value={String(flakeSignals)}
          indicator={flakeSignals > 0 ? 'warning' : 'success'}
        />
        <StatCard label="Memory Usage" value={`${memoryMb} MB`} indicator="default" />
      </div>

      {/* Charts 2x2 */}
      <div className="grid grid-cols-2 gap-3">
        <ChartCard
          title="Pass Rate"
          current={`${passPercent}%`}
          series={passRateSeries}
          seriesIndex={0}
          fallbackColor="#22c55e"
        />
        <ChartCard
          title="Latency"
          current={`${avgLatency}ms`}
          series={latencySeries}
          seriesIndex={0}
          fallbackColor="#3b82f6"
        />
        <ChartCard
          title="Memory"
          current={`${memoryMb} MB`}
          series={memorySeries}
          seriesIndex={0}
          fallbackColor="#8b5cf6"
        />
        <ChartCard
          title="Throughput"
          current={`${snapshot?.totalRuns ?? 0} runs`}
          series={throughputSeries}
          seriesIndex={0}
          fallbackColor="#06b6d4"
        />
      </div>

      {/* Progress section */}
      <div className="grid grid-cols-2 gap-3">
        <ProgressCard label="Explore Progress" value={exploreProgress} color="accent-primary" />
        <ProgressCard label="Fuzz Progress" value={fuzzProgress} color="accent-primary" />
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  indicator,
}: {
  label: string;
  value: string;
  indicator: 'success' | 'warning' | 'error' | 'default';
}) {
  const colorMap = {
    success: 'text-success',
    warning: 'text-warning',
    error: 'text-error',
    default: 'text-text-primary',
  } as const;

  return (
    <Card className="p-0">
      <div className="flex flex-col gap-1">
        <span className="text-[11px] text-text-muted font-medium">{label}</span>
        <span className={cn('text-xl font-bold tabular-nums', colorMap[indicator])}>{value}</span>
      </div>
    </Card>
  );
}

interface ChartCardProps {
  title: string;
  current: string;
  series: import('@/types').TelemetrySeries[] | undefined;
  seriesIndex: number;
  fallbackColor: string;
}

function ChartCard({ title, current, series, seriesIndex, fallbackColor }: ChartCardProps) {
  const s = series?.[seriesIndex];

  return (
    <Card className="p-0">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-secondary font-medium">{title}</span>
          <span className="text-sm font-semibold text-text-primary tabular-nums">{current}</span>
        </div>
        {s ? (
          <MiniChart data={s.data} color={s.color || fallbackColor} height={100} showLabels />
        ) : (
          <div className="h-[100px] flex items-center justify-center text-text-muted text-xs">
            Loading...
          </div>
        )}
      </div>
    </Card>
  );
}

function ProgressCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const pct = Math.min(100, Math.max(0, value));

  return (
    <Card className="p-0">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-secondary font-medium">{label}</span>
          <span className="text-xs text-text-primary font-semibold tabular-nums">
            {pct.toFixed(1)}%
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-bg-tertiary overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-500', `bg-${color}`)}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </Card>
  );
}
