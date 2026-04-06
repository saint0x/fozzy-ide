import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRuns, useActiveRuns, useCancelRun } from '@/hooks/use-data';
import { useAppStore } from '@/stores/app-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/ui/status-dot';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Dropdown, DropdownItem } from '@/components/ui/dropdown';
import { cn, formatDuration, formatRelativeTime, getStatusBgColor } from '@/lib/utils';
import type { RunState } from '@/types';

const STATE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'All states', value: 'all' },
  { label: 'Running', value: 'running' },
  { label: 'Passed', value: 'passed' },
  { label: 'Failed', value: 'failed' },
  { label: 'Cancelled', value: 'cancelled' },
];

function stateToVariant(state: RunState) {
  switch (state) {
    case 'passed': return 'success' as const;
    case 'failed': case 'timeout': return 'error' as const;
    case 'running': case 'queued': return 'info' as const;
    case 'cancelled': return 'default' as const;
  }
}

export default function RunsPage() {
  const setActiveSection = useAppStore((s) => s.setActiveSection);
  const navigate = useNavigate();

  const [stateFilter, setStateFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setActiveSection('runs');
  }, [setActiveSection]);

  const runsQuery = useRuns(
    stateFilter !== 'all' ? { state: stateFilter } : undefined,
  );
  const activeRunsQuery = useActiveRuns();
  const cancelMutation = useCancelRun();

  const activeRuns = activeRunsQuery.data ?? [];

  const filteredRuns = useMemo(() => {
    const runs = runsQuery.data ?? [];
    if (!search.trim()) return runs;
    const q = search.toLowerCase();
    return runs.filter(
      (r) =>
        r.scenarioName.toLowerCase().includes(q) ||
        r.projectName.toLowerCase().includes(q),
    );
  }, [runsQuery.data, search]);

  const selectedStateLabel =
    STATE_OPTIONS.find((o) => o.value === stateFilter)?.label ?? 'All states';

  if (runsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" className="text-text-tertiary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto">
      {/* Active run banner */}
      {activeRuns.length > 0 && (
        <div className="space-y-2">
          {activeRuns.map((run) => (
            <div
              key={run.id}
              className="flex items-center gap-4 rounded-lg border-l-4 border-l-accent-primary border border-border-default bg-bg-secondary px-4 py-3"
            >
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-primary opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent-primary" />
              </span>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-text-primary truncate">
                  {run.scenarioName}
                </span>
                <span className="ml-2 text-xs text-text-tertiary">
                  {run.projectName}
                </span>
              </div>
              <span className="text-xs text-text-secondary tabular-nums">
                {formatRelativeTime(run.startedAt)}
              </span>
              <Button
                variant="danger"
                size="sm"
                loading={cancelMutation.isPending}
                onClick={(e) => {
                  e.stopPropagation();
                  cancelMutation.mutate(run.id);
                }}
              >
                Cancel
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold text-text-primary">Runs</h1>
        <div className="flex items-center gap-3">
          <Input
            placeholder="Search runs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56"
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            }
          />
          <Dropdown
            trigger={
              <Button variant="outline" size="sm">
                {selectedStateLabel}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </Button>
            }
          >
            {STATE_OPTIONS.map((opt) => (
              <DropdownItem
                key={opt.value}
                onClick={() => setStateFilter(opt.value)}
              >
                {opt.label}
              </DropdownItem>
            ))}
          </Dropdown>
        </div>
      </div>

      {/* Run history table */}
      {filteredRuns.length === 0 ? (
        <EmptyState
          title="No runs found"
          description={search ? 'Try adjusting your search or filters.' : 'Run a scenario to see results here.'}
        />
      ) : (
        <div className="rounded-lg border border-border-default overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-default bg-bg-tertiary text-text-tertiary text-xs">
                <th className="text-left font-medium px-4 py-2">State</th>
                <th className="text-left font-medium px-4 py-2">Scenario</th>
                <th className="text-left font-medium px-4 py-2">Project</th>
                <th className="text-left font-medium px-4 py-2">Started</th>
                <th className="text-left font-medium px-4 py-2">Duration</th>
                <th className="text-left font-medium px-4 py-2">Exit</th>
                <th className="text-left font-medium px-4 py-2">Artifacts</th>
                <th className="text-left font-medium px-4 py-2">Trace</th>
                <th className="text-right font-medium px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRuns.map((run) => (
                <tr
                  key={run.id}
                  onClick={() => navigate(`/runs/${run.id}`)}
                  className="border-b border-border-default last:border-b-0 hover:bg-bg-hover cursor-default transition-colors duration-100"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <StatusDot
                        status={run.state}
                        pulse={run.state === 'running'}
                      />
                      <Badge
                        variant={stateToVariant(run.state)}
                        size="sm"
                      >
                        {run.state}
                      </Badge>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-text-primary">
                      {run.scenarioName}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-text-secondary">
                    {run.projectName}
                  </td>
                  <td className="px-4 py-2.5 text-text-secondary text-xs">
                    {formatRelativeTime(run.startedAt)}
                  </td>
                  <td className="px-4 py-2.5 text-text-secondary text-xs tabular-nums">
                    {run.duration != null ? formatDuration(run.duration) : '--'}
                  </td>
                  <td className="px-4 py-2.5">
                    {run.exitCode != null ? (
                      <span
                        className={cn(
                          'font-mono text-xs',
                          run.exitCode !== 0 ? 'text-error' : 'text-text-secondary',
                        )}
                      >
                        {run.exitCode}
                      </span>
                    ) : (
                      <span className="text-text-tertiary text-xs">--</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {run.artifacts.length > 0 ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/runs/${run.id}`, { state: { tab: 'artifacts' } });
                        }}
                        className="text-xs text-accent-primary hover:underline"
                      >
                        {run.artifacts.length} file{run.artifacts.length !== 1 ? 's' : ''}
                      </button>
                    ) : (
                      <span className="text-text-tertiary text-xs">--</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {run.traceId ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/traces/${run.traceId}`);
                        }}
                        className="text-xs text-accent-primary hover:underline"
                      >
                        View trace
                      </button>
                    ) : (
                      <span className="text-text-tertiary text-xs">--</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/runs/${run.id}`);
                        }}
                      >
                        Details
                      </Button>
                      {(run.state === 'running' || run.state === 'queued') && (
                        <Button
                          variant="danger"
                          size="sm"
                          loading={cancelMutation.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            cancelMutation.mutate(run.id);
                          }}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
