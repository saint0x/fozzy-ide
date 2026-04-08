import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/stores/app-store';
import { useActiveWorkspace, useTrendReport } from '@/hooks/use-data';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { MiniChart } from '@/components/domain/mini-chart';
import { cn, formatRelativeTime } from '@/lib/utils';
import type { TrendSeriesResponse, ScenarioTrend, CommandTrend } from '@/types/backend-contracts';

type TrendRange = '24h' | '7d' | '30d';

const RANGES: TrendRange[] = ['24h', '7d', '30d'];

const RANGE_LABELS: Record<TrendRange, string> = {
  '24h': 'Last 24 Hours',
  '7d': 'Last 7 Days',
  '30d': 'Last 30 Days',
};

const SERIES_COLORS: Record<string, string> = {
  passRate: '#22c55e',
  latency: '#3b82f6',
  throughput: '#06b6d4',
  memory: '#a855f7',
};

function seriesColor(key: string): string {
  return SERIES_COLORS[key] ?? '#6b7280';
}

function rateIndicator(rate: number): 'success' | 'warning' | 'error' {
  if (rate >= 0.9) return 'success';
  if (rate >= 0.7) return 'warning';
  return 'error';
}

function rateColorClass(rate: number): string {
  if (rate >= 0.9) return 'text-success';
  if (rate >= 0.7) return 'text-warning';
  return 'text-error';
}

function mapSeriesToChart(series: TrendSeriesResponse): { timestamp: string; value: number }[] {
  return series.points.map((p) => ({ timestamp: p.ts, value: p.value }));
}

function truncatePath(path: string, maxLen = 40): string {
  if (path.length <= maxLen) return path;
  return '...' + path.slice(path.length - maxLen + 3);
}

export default function TrendsPage() {
  const setActiveSection = useAppStore((s) => s.setActiveSection);
  const navigate = useNavigate();
  const [range, setRange] = useState<TrendRange>('7d');

  useEffect(() => {
    setActiveSection('trends');
  }, [setActiveSection]);

  const workspace = useActiveWorkspace();
  const { data: report, isLoading, isError } = useTrendReport(range);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" className="text-text-muted" />
      </div>
    );
  }

  if (isError || !report) {
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState
          title="No historical data yet"
          description="Run some tests to see trends. Fozzy needs at least a few runs to generate trend analysis."
          action={
            <Button variant="primary" size="sm" onClick={() => navigate('/tests')}>
              Go to Tests
            </Button>
          }
        />
      </div>
    );
  }

  const { snapshot, series, topScenarios, commandBreakdown } = report;
  const passPercent = (snapshot.passRate * 100).toFixed(1);
  const failPercent = (snapshot.failRate * 100).toFixed(1);

  return (
    <div className="flex flex-col gap-5 p-5 overflow-y-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-text-primary">Trends</h1>
          {workspace && (
            <span className="text-xs text-text-tertiary">{workspace.name}</span>
          )}
          <Badge variant="outline" size="sm">
            {RANGE_LABELS[range]}
          </Badge>
          <Badge variant="default" size="sm">
            Updated {formatRelativeTime(report.generatedAt)}
          </Badge>
        </div>

        <div className="flex items-center gap-1 rounded-md border border-border-default bg-bg-secondary p-0.5">
          {RANGES.map((r) => (
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

      {/* KPI row */}
      <div className="grid grid-cols-6 gap-3">
        <KpiCard
          label="Pass Rate"
          value={`${passPercent}%`}
          indicator={rateIndicator(snapshot.passRate)}
        />
        <KpiCard
          label="Fail Rate"
          value={`${failPercent}%`}
          indicator={snapshot.failRate > 0.1 ? 'error' : snapshot.failRate > 0 ? 'warning' : 'success'}
        />
        <KpiCard
          label="Avg Latency"
          value={`${Math.round(snapshot.avgLatencyMs)}ms`}
          indicator="default"
        />
        <KpiCard
          label="Throughput/hr"
          value={String(snapshot.throughputPerHour)}
          indicator="default"
        />
        <KpiCard
          label="Trace Record"
          value={`${(snapshot.traceRecordRate * 100).toFixed(0)}%`}
          indicator="default"
        />
        <KpiCard
          label="Flake Signals"
          value={String(snapshot.flakeSignals)}
          indicator={snapshot.flakeSignals > 0 ? 'warning' : 'success'}
        />
      </div>

      {/* Charts 2x2 */}
      <div className="grid grid-cols-2 gap-3">
        {series.length > 0 ? (
          series.slice(0, 4).map((s) => (
            <TrendChartCard key={s.key} series={s} />
          ))
        ) : (
          <>
            <ChartPlaceholder label="Pass Rate" />
            <ChartPlaceholder label="Latency" />
            <ChartPlaceholder label="Throughput" />
            <ChartPlaceholder label="Memory" />
          </>
        )}
      </div>

      {/* Secondary panels */}
      <div className="grid grid-cols-5 gap-3">
        {/* Top Unstable Scenarios - wider */}
        <div className="col-span-3">
          <Card
            padding={false}
            header={
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-text-secondary">Top Unstable Scenarios</span>
                <Badge variant="default" size="sm">{topScenarios.length}</Badge>
              </div>
            }
          >
            {topScenarios.length === 0 ? (
              <div className="py-8 text-center text-xs text-text-muted">
                No scenario trend data available
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border-muted">
                      <th className="text-left py-2 px-3 text-text-muted font-medium">Scenario</th>
                      <th className="text-right py-2 px-3 text-text-muted font-medium">Runs</th>
                      <th className="text-right py-2 px-3 text-text-muted font-medium">Success</th>
                      <th className="text-right py-2 px-3 text-text-muted font-medium">Latency</th>
                      <th className="text-center py-2 px-3 text-text-muted font-medium">Status</th>
                      <th className="text-right py-2 px-3 text-text-muted font-medium">Last Run</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortByWorstSuccess(topScenarios).map((scenario) => (
                      <ScenarioRow key={scenario.scenarioPath} scenario={scenario} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* Command Breakdown - narrower */}
        <div className="col-span-2">
          <Card
            padding={false}
            header={
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-text-secondary">Command Breakdown</span>
                <Badge variant="default" size="sm">{commandBreakdown.length}</Badge>
              </div>
            }
          >
            {commandBreakdown.length === 0 ? (
              <div className="py-8 text-center text-xs text-text-muted">
                No command data available
              </div>
            ) : (
              <div className="flex flex-col">
                {commandBreakdown.map((cmd) => (
                  <CommandRow key={cmd.command} command={cmd} />
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────────

function KpiCard({
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
        <span className="text-[10px] text-text-muted font-medium uppercase tracking-wider">{label}</span>
        <span className={cn('text-xl font-bold tabular-nums', colorMap[indicator])}>{value}</span>
      </div>
    </Card>
  );
}

function TrendChartCard({ series }: { series: TrendSeriesResponse }) {
  const data = mapSeriesToChart(series);
  const color = seriesColor(series.key);
  const current = data.length > 0 ? data[data.length - 1].value : 0;
  const formatVal = current >= 1 ? current.toFixed(1) : current.toFixed(3);

  return (
    <Card className="p-0">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-secondary font-medium">{series.label}</span>
          <span className="text-sm font-semibold text-text-primary tabular-nums">{formatVal}</span>
        </div>
        <MiniChart data={data} color={color} height={100} showLabels />
      </div>
    </Card>
  );
}

function ChartPlaceholder({ label }: { label: string }) {
  return (
    <Card className="p-0">
      <div className="flex flex-col gap-2">
        <span className="text-xs text-text-secondary font-medium">{label}</span>
        <div className="h-[100px] flex items-center justify-center text-text-muted text-xs">
          No series data
        </div>
      </div>
    </Card>
  );
}

function sortByWorstSuccess(scenarios: ScenarioTrend[]): ScenarioTrend[] {
  return [...scenarios].sort((a, b) => a.successRate - b.successRate);
}

function ScenarioRow({ scenario }: { scenario: ScenarioTrend }) {
  const successPercent = (scenario.successRate * 100).toFixed(1);
  const normalizedStatus = scenario.lastStatus.toLowerCase();
  const statusVariant =
    normalizedStatus === 'pass' || normalizedStatus === 'passed' || normalizedStatus === 'succeeded'
      ? 'success'
      : normalizedStatus === 'fail' || normalizedStatus === 'failed' || normalizedStatus === 'error' || normalizedStatus === 'timeout' || normalizedStatus === 'crash'
        ? 'error'
        : 'default';

  return (
    <tr className="border-b border-border-muted last:border-b-0 hover:bg-bg-hover transition-colors">
      <td className="py-2 px-3 font-mono text-text-secondary" title={scenario.scenarioPath}>
        {truncatePath(scenario.scenarioPath)}
      </td>
      <td className="py-2 px-3 text-right tabular-nums text-text-secondary">
        {scenario.totalRuns}
      </td>
      <td className={cn('py-2 px-3 text-right tabular-nums font-medium', rateColorClass(scenario.successRate))}>
        {successPercent}%
      </td>
      <td className="py-2 px-3 text-right tabular-nums text-text-secondary">
        {Math.round(scenario.avgLatencyMs)}ms
      </td>
      <td className="py-2 px-3 text-center">
        <Badge variant={statusVariant} size="sm">
          {scenario.lastStatus}
        </Badge>
      </td>
      <td className="py-2 px-3 text-right text-text-muted">
        {formatRelativeTime(scenario.lastRunAt)}
      </td>
    </tr>
  );
}

function CommandRow({ command }: { command: CommandTrend }) {
  const successPercent = Math.round(command.successRate * 100);

  return (
    <div className="flex flex-col gap-1.5 px-3 py-2.5 border-b border-border-muted last:border-b-0">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-text-secondary">{command.command}</span>
        <span className="text-[10px] text-text-muted tabular-nums">{command.totalRuns} runs</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-300',
              command.successRate >= 0.9 ? 'bg-success' : command.successRate >= 0.7 ? 'bg-warning' : 'bg-error',
            )}
            style={{ width: `${successPercent}%` }}
          />
        </div>
        <span className={cn('text-[10px] tabular-nums font-medium w-8 text-right', rateColorClass(command.successRate))}>
          {successPercent}%
        </span>
        <span className="text-[10px] text-text-muted tabular-nums w-12 text-right">
          {Math.round(command.avgLatencyMs)}ms
        </span>
      </div>
    </div>
  );
}
