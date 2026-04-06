import { useEffect, useMemo } from 'react';
import { useAppStore } from '@/stores/app-store';
import {
  useWorkspace,
  useScenarios,
  useActiveRuns,
  useRuns,
  useActivity,
} from '@/hooks/use-data';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusDot } from '@/components/ui/status-dot';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { cn, formatDuration, formatRelativeTime, getStatusColor } from '@/lib/utils';
import type { Scenario, Run, ActivityItem } from '@/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function passRateColor(rate: number): string {
  if (rate >= 80) return 'text-success';
  if (rate >= 60) return 'text-warning';
  return 'text-error';
}

function activityIcon(type: ActivityItem['type']): string {
  switch (type) {
    case 'run_started': return '\u25B6';
    case 'run_passed': return '\u2713';
    case 'run_failed': return '\u2717';
    case 'scan_complete': return '\u2690';
    case 'trace_complete': return '\u2261';
    case 'warning': return '\u26A0';
    default: return '\u2022';
  }
}

function activityIconColor(type: ActivityItem['type']): string {
  switch (type) {
    case 'run_passed': return 'text-success';
    case 'run_failed': return 'text-error';
    case 'warning': return 'text-warning';
    case 'run_started': return 'text-accent-primary';
    default: return 'text-text-tertiary';
  }
}

// ── Next Best Action ─────────────────────────────────────────────────────────

interface NextAction {
  title: string;
  description: string;
  variant: 'success' | 'warning' | 'error' | 'info';
}

function deriveNextAction(
  failingCount: number,
  coveragePercent: number,
  flakyCount: number,
): NextAction {
  if (failingCount > 0) {
    return {
      title: `${failingCount} failing test${failingCount > 1 ? 's' : ''} need attention`,
      description: 'Fix failing tests to restore a green build before continuing development.',
      variant: 'error',
    };
  }
  if (flakyCount > 0) {
    return {
      title: `${flakyCount} flaky test${flakyCount > 1 ? 's' : ''} detected`,
      description: 'Investigate flaky tests to improve reliability and trust in your test suite.',
      variant: 'warning',
    };
  }
  if (coveragePercent < 70) {
    return {
      title: 'Coverage below target',
      description: `Current coverage is ${coveragePercent}%. Consider adding tests for uncovered paths.`,
      variant: 'warning',
    };
  }
  return {
    title: 'All tests passing',
    description: 'Your test suite is healthy. Keep up the good work.',
    variant: 'success',
  };
}

// ── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  subtext,
  colorClass,
  trailing,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  colorClass?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <Card className="flex-1 min-w-[140px]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-text-tertiary mb-1">{label}</p>
          <p className={cn('text-2xl font-semibold tracking-tight', colorClass ?? 'text-text-primary')}>
            {value}
          </p>
          {subtext && <p className="text-xs text-text-tertiary mt-0.5">{subtext}</p>}
        </div>
        {trailing && <div>{trailing}</div>}
      </div>
    </Card>
  );
}

// ── Test Distribution Bar ────────────────────────────────────────────────────

function TestDistribution({ scenarios }: { scenarios: Scenario[] }) {
  const counts = useMemo(() => {
    const c = { passing: 0, failing: 0, flaky: 0, skipped: 0, unknown: 0 };
    for (const s of scenarios) {
      c[s.status] = (c[s.status] ?? 0) + 1;
    }
    return c;
  }, [scenarios]);

  const total = scenarios.length;
  if (total === 0) return null;

  const segments: { key: string; count: number; color: string; label: string }[] = [
    { key: 'passing', count: counts.passing, color: 'bg-success', label: 'Passing' },
    { key: 'failing', count: counts.failing, color: 'bg-error', label: 'Failing' },
    { key: 'flaky', count: counts.flaky, color: 'bg-warning', label: 'Flaky' },
    { key: 'skipped', count: counts.skipped, color: 'bg-text-muted', label: 'Skipped' },
  ];

  return (
    <div>
      {/* Stacked bar */}
      <div className="flex h-3 rounded-full overflow-hidden bg-bg-tertiary">
        {segments.map((seg) =>
          seg.count > 0 ? (
            <div
              key={seg.key}
              className={cn(seg.color, 'transition-all duration-300')}
              style={{ width: `${(seg.count / total) * 100}%` }}
            />
          ) : null,
        )}
      </div>
      {/* Legend */}
      <div className="flex items-center gap-4 mt-2.5">
        {segments.map((seg) => (
          <div key={seg.key} className="flex items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-full', seg.color)} />
            <span className="text-xs text-text-secondary">
              {seg.label} <span className="text-text-tertiary">{seg.count}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const { activeWorkspaceId, setActiveSection } = useAppStore();

  useEffect(() => {
    setActiveSection('overview');
  }, [setActiveSection]);

  const { data: workspace, isLoading: wsLoading } = useWorkspace(activeWorkspaceId);
  const { data: scenarios, isLoading: scenariosLoading } = useScenarios();
  const { data: activeRuns } = useActiveRuns();
  const { data: recentRuns, isLoading: runsLoading } = useRuns({ limit: 5 });
  const { data: activity, isLoading: activityLoading } = useActivity(10);

  const isLoading = wsLoading || scenariosLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!workspace) {
    return (
      <EmptyState
        title="No workspace selected"
        description="Select or import a workspace to get started."
      />
    );
  }

  const passRate = workspace.testCount > 0
    ? Math.round((workspace.passingCount / workspace.testCount) * 100)
    : 0;

  const flakyCount = scenarios?.filter((s) => s.status === 'flaky').length ?? 0;
  const activeRunCount = activeRuns?.length ?? 0;
  const nextAction = deriveNextAction(workspace.failingCount, workspace.coveragePercent, flakyCount);

  const nbaVariantStyles: Record<string, string> = {
    success: 'border-success/30 bg-success/5',
    warning: 'border-warning/30 bg-warning/5',
    error: 'border-error/30 bg-error/5',
    info: 'border-accent-primary/30 bg-accent-primary/5',
  };

  return (
    <div className="p-6 space-y-6 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Overview</h1>
          <p className="text-xs text-text-tertiary mt-0.5">{workspace.name}</p>
        </div>
        <Button variant="primary" size="md">
          Run All Tests
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Total Tests" value={workspace.testCount} />
        <StatCard
          label="Pass Rate"
          value={`${passRate}%`}
          colorClass={passRateColor(passRate)}
        />
        <StatCard
          label="Active Runs"
          value={activeRunCount}
          trailing={
            activeRunCount > 0 ? (
              <Badge variant="info" dot>
                Running
              </Badge>
            ) : null
          }
        />
        <StatCard
          label="Coverage"
          value={`${workspace.coveragePercent}%`}
          colorClass={workspace.coveragePercent >= 70 ? 'text-success' : 'text-warning'}
        />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-[1fr_340px] gap-4">
        {/* Left column */}
        <div className="space-y-4">
          {/* Next Best Action */}
          <div
            className={cn(
              'rounded-lg border p-4',
              nbaVariantStyles[nextAction.variant],
            )}
          >
            <p className="text-sm font-medium text-text-primary">{nextAction.title}</p>
            <p className="text-xs text-text-secondary mt-1">{nextAction.description}</p>
          </div>

          {/* Recent Runs */}
          <Card
            header={<span className="text-xs font-medium text-text-secondary">Recent Runs</span>}
            padding={false}
          >
            {runsLoading ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : !recentRuns || recentRuns.length === 0 ? (
              <EmptyState title="No runs yet" description="Run a test to see results here." />
            ) : (
              <div className="divide-y divide-border-default">
                {recentRuns.map((run: Run) => (
                  <button
                    key={run.id}
                    className="flex items-center gap-3 w-full px-3 py-2.5 text-left hover:bg-bg-hover transition-colors cursor-default"
                  >
                    <StatusDot status={run.state} pulse={run.state === 'running'} />
                    <span className="text-sm text-text-primary truncate flex-1">
                      {run.scenarioName}
                    </span>
                    <Badge
                      variant={
                        run.state === 'passed'
                          ? 'success'
                          : run.state === 'failed'
                            ? 'error'
                            : run.state === 'running'
                              ? 'info'
                              : 'default'
                      }
                    >
                      {run.state}
                    </Badge>
                    {run.duration != null && (
                      <span className="text-xs text-text-tertiary w-14 text-right">
                        {formatDuration(run.duration)}
                      </span>
                    )}
                    <span className="text-xs text-text-tertiary w-16 text-right">
                      {formatRelativeTime(run.startedAt)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Card>

          {/* Test Distribution */}
          <Card
            header={
              <span className="text-xs font-medium text-text-secondary">Test Distribution</span>
            }
          >
            {scenarios && scenarios.length > 0 ? (
              <TestDistribution scenarios={scenarios} />
            ) : (
              <p className="text-xs text-text-tertiary">No test data available.</p>
            )}
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Activity Feed */}
          <Card
            header={
              <span className="text-xs font-medium text-text-secondary">Activity</span>
            }
            padding={false}
          >
            {activityLoading ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : !activity || activity.length === 0 ? (
              <EmptyState title="No activity" />
            ) : (
              <div className="max-h-[360px] overflow-y-auto divide-y divide-border-default">
                {activity.map((item: ActivityItem) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-2.5 px-3 py-2.5"
                  >
                    <span
                      className={cn(
                        'text-sm leading-none mt-0.5 shrink-0',
                        activityIconColor(item.type),
                      )}
                    >
                      {activityIcon(item.type)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-text-primary leading-snug">
                        {item.message}
                      </p>
                      <p className="text-[10px] text-text-tertiary mt-0.5">
                        {formatRelativeTime(item.timestamp)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Quick Actions */}
          <Card
            header={
              <span className="text-xs font-medium text-text-secondary">Quick Actions</span>
            }
          >
            <div className="flex flex-col gap-2">
              <Button variant="outline" size="sm" className="w-full justify-start">
                <span className={cn('text-error')}>&#9654;</span>
                Run Failing Tests
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start">
                <span className="text-text-tertiary">&#9998;</span>
                Open Editor
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start">
                <span className="text-accent-primary">&#9632;</span>
                View Telemetry
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
