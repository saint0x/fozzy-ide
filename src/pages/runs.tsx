import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRuns, useActiveRuns, useCancelRun, useExecuteWorkflow } from '@/hooks/use-data';
import { useWorkflowEvents } from '@/hooks/use-events';
import { useAppStore } from '@/stores/app-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/ui/status-dot';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Dropdown, DropdownItem } from '@/components/ui/dropdown';
import { cn, formatDuration, formatRelativeTime } from '@/lib/utils';
import type { RunState } from '@/types';
import type { WorkspaceWorkflowResult } from '@/types/backend-contracts';
import type { WorkflowStep } from '@/hooks/use-events';

const STATE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'All states', value: 'all' },
  { label: 'Running', value: 'running' },
  { label: 'Passed', value: 'passed' },
  { label: 'Failed', value: 'failed' },
  { label: 'Cancelled', value: 'cancelled' },
];

const COMMAND_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'All commands', value: 'all' },
  { label: 'Run', value: 'run' },
  { label: 'Test', value: 'test' },
  { label: 'Fuzz', value: 'fuzz' },
  { label: 'Explore', value: 'explore' },
  { label: 'Memory', value: 'memory' },
  { label: 'Host', value: 'host' },
];

const SOURCE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'All sources', value: 'all' },
  { label: 'Workflow', value: 'workflow' },
  { label: 'Standalone', value: 'standalone' },
];

const MODE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'Full', value: 'full' },
  { label: 'Quick', value: 'quick' },
  { label: 'Strict Only', value: 'strict' },
];

function stateToVariant(state: RunState) {
  switch (state) {
    case 'passed': return 'success' as const;
    case 'failed': case 'timeout': return 'error' as const;
    case 'running': case 'queued': return 'info' as const;
    case 'cancelled': return 'default' as const;
  }
}

function StepIcon({ status }: { status: WorkflowStep['status'] }) {
  if (status === 'running') {
    return <Spinner size="sm" className="text-accent-primary" />;
  }
  if (status === 'complete') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-400">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  }
  if (status === 'failed') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-error">
        <circle cx="12" cy="12" r="10" />
        <path d="m15 9-6 6" />
        <path d="m9 9 6 6" />
      </svg>
    );
  }
  return (
    <div className="h-4 w-4 rounded-full border-2 border-border-default" />
  );
}

function stepStatusBadge(status: WorkflowStep['status']) {
  switch (status) {
    case 'running': return 'info' as const;
    case 'complete': return 'success' as const;
    case 'failed': return 'error' as const;
    default: return 'default' as const;
  }
}

export default function RunsPage() {
  const setActiveSection = useAppStore((s) => s.setActiveSection);
  const navigate = useNavigate();

  const [stateFilter, setStateFilter] = useState('all');
  const [commandFilter, setCommandFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [workflowMode, setWorkflowMode] = useState('full');
  const [includeHostVariants, setIncludeHostVariants] = useState(true);
  const [progressExpanded, setProgressExpanded] = useState(true);
  const [lastResult, setLastResult] = useState<WorkspaceWorkflowResult | null>(null);
  const [resultDismissed, setResultDismissed] = useState(false);

  useEffect(() => {
    setActiveSection('runs');
  }, [setActiveSection]);

  const runsQuery = useRuns(
    stateFilter !== 'all' ? { state: stateFilter } : undefined,
  );
  const activeRunsQuery = useActiveRuns();
  const cancelMutation = useCancelRun();
  const workflowMutation = useExecuteWorkflow();
  const workflowProgress = useWorkflowEvents();

  const activeRuns = activeRunsQuery.data ?? [];

  // Store workflow result when mutation succeeds
  useEffect(() => {
    if (workflowMutation.data) {
      setLastResult(workflowMutation.data);
      setResultDismissed(false);
    }
  }, [workflowMutation.data]);

  const filteredRuns = useMemo(() => {
    const runs = runsQuery.data ?? [];
    let result = runs;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.scenarioName.toLowerCase().includes(q) ||
          r.projectName.toLowerCase().includes(q),
      );
    }

    if (commandFilter !== 'all') {
      result = result.filter((r) =>
        r.scenarioName.toLowerCase().includes(commandFilter),
      );
    }

    if (sourceFilter === 'workflow' && lastResult) {
      const workflowRunIds = new Set(lastResult.runIds);
      result = result.filter((r) => workflowRunIds.has(r.id));
    } else if (sourceFilter === 'standalone' && lastResult) {
      const workflowRunIds = new Set(lastResult.runIds);
      result = result.filter((r) => !workflowRunIds.has(r.id));
    }

    return result;
  }, [runsQuery.data, search, commandFilter, sourceFilter, lastResult]);

  const selectedStateLabel =
    STATE_OPTIONS.find((o) => o.value === stateFilter)?.label ?? 'All states';
  const selectedCommandLabel =
    COMMAND_OPTIONS.find((o) => o.value === commandFilter)?.label ?? 'All commands';
  const selectedSourceLabel =
    SOURCE_OPTIONS.find((o) => o.value === sourceFilter)?.label ?? 'All sources';
  const selectedModeLabel =
    MODE_OPTIONS.find((o) => o.value === workflowMode)?.label ?? 'Full';

  const isWorkflowActive = workflowMutation.isPending || (workflowProgress?.isRunning ?? false);
  const showResult = lastResult && !resultDismissed && !isWorkflowActive;
  const showProgress = isWorkflowActive && workflowProgress;

  if (runsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" className="text-text-tertiary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto">
      {/* Workflow CTA */}
      <div className="rounded-lg border border-border-default bg-bg-secondary p-5">
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1.5">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-primary shrink-0">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
              </svg>
              <h2 className="text-base font-semibold text-text-primary">Confidence Pass</h2>
            </div>
            <p className="text-sm text-text-tertiary pl-8">
              Run all Fozzy workflows — generation, strict suite, doctor, trace verify, replay, CI
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeHostVariants}
                onChange={(e) => setIncludeHostVariants(e.target.checked)}
                className="rounded border-border-default bg-bg-tertiary text-accent-primary focus:ring-accent-primary focus:ring-offset-0 h-3.5 w-3.5"
              />
              Host variants
            </label>
            <Dropdown
              trigger={
                <Button variant="outline" size="sm">
                  {selectedModeLabel}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </Button>
              }
            >
              {MODE_OPTIONS.map((opt) => (
                <DropdownItem
                  key={opt.value}
                  onClick={() => setWorkflowMode(opt.value)}
                >
                  {opt.label}
                </DropdownItem>
              ))}
            </Dropdown>
            <Button
              variant="primary"
              loading={isWorkflowActive}
              onClick={() =>
                workflowMutation.mutate({
                  mode: workflowMode,
                  includeHostVariants,
                })
              }
              disabled={isWorkflowActive}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                <polygon points="6 3 20 12 6 21 6 3" />
              </svg>
              {isWorkflowActive ? 'Running...' : 'Run Confidence Pass'}
            </Button>
          </div>
        </div>

        {/* Inline workflow progress */}
        {showProgress && (
          <div className="mt-4 border-t border-border-default pt-4">
            <button
              onClick={() => setProgressExpanded((p) => !p)}
              className="flex items-center gap-2 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors w-full text-left"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={cn('transition-transform', progressExpanded ? 'rotate-90' : '')}
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
              Workflow Progress
              <Spinner size="sm" className="ml-1 text-accent-primary" />
            </button>
            {progressExpanded && (
              <div className="mt-3 pl-2 space-y-2">
                {workflowProgress.steps.map((step, i) => (
                  <div key={step.kind} className="flex items-center gap-3">
                    <div className="flex flex-col items-center">
                      <StepIcon status={step.status} />
                      {i < workflowProgress.steps.length - 1 && (
                        <div className="w-px h-4 bg-border-default mt-1" />
                      )}
                    </div>
                    <span className="text-sm text-text-primary">{step.label}</span>
                    <Badge variant={stepStatusBadge(step.status)} size="sm">
                      {step.status}
                    </Badge>
                    <span className="text-xs text-text-tertiary ml-auto tabular-nums">
                      {formatRelativeTime(step.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Workflow error */}
        {workflowMutation.isError && (
          <div className="mt-3 rounded-md bg-red-950/30 border border-red-900/50 px-3 py-2 text-sm text-red-300">
            Workflow failed: {workflowMutation.error?.message ?? 'Unknown error'}
          </div>
        )}
      </div>

      {/* Workflow result summary */}
      {showResult && (
        <div className="rounded-lg border border-green-900/40 bg-green-950/20 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-400">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              <h3 className="text-sm font-semibold text-text-primary">Workflow Complete</h3>
              <Badge variant="success" size="sm">{lastResult.mode}</Badge>
            </div>
            <button
              onClick={() => setResultDismissed(true)}
              className="text-text-tertiary hover:text-text-secondary transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-text-tertiary text-xs block mb-1">Scenarios</span>
              <span className="text-text-primary font-medium">{lastResult.scenarioCount}</span>
            </div>
            <div>
              <span className="text-text-tertiary text-xs block mb-1">Runs</span>
              <span className="text-text-primary font-medium">{lastResult.runIds.length}</span>
            </div>
            <div>
              <span className="text-text-tertiary text-xs block mb-1">Traces</span>
              <span className="text-text-primary font-medium">{lastResult.tracePaths.length}</span>
            </div>
          </div>
          {lastResult.generatedPaths.length > 0 && (
            <div className="mt-3 border-t border-green-900/30 pt-3">
              <span className="text-xs text-text-tertiary block mb-1.5">Generated / updated files</span>
              <div className="flex flex-wrap gap-1.5">
                {lastResult.generatedPaths.map((p) => (
                  <span key={p} className="text-xs font-mono bg-bg-tertiary text-text-secondary rounded px-1.5 py-0.5">
                    {p.split('/').pop()}
                  </span>
                ))}
              </div>
            </div>
          )}
          {lastResult.runIds.length > 0 && (
            <div className="mt-3 border-t border-green-900/30 pt-3">
              <span className="text-xs text-text-tertiary block mb-1.5">Run IDs</span>
              <div className="flex flex-wrap gap-1.5">
                {lastResult.runIds.map((id) => (
                  <button
                    key={id}
                    onClick={() => navigate(`/runs/${id}`)}
                    className="text-xs font-mono text-accent-primary hover:underline"
                  >
                    {id.slice(0, 8)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {lastResult.tracePaths.length > 0 && (
            <div className="mt-3 border-t border-green-900/30 pt-3">
              <span className="text-xs text-text-tertiary block mb-1.5">Trace paths</span>
              <div className="flex flex-wrap gap-1.5">
                {lastResult.tracePaths.map((p) => (
                  <span key={p} className="text-xs font-mono bg-bg-tertiary text-text-secondary rounded px-1.5 py-0.5">
                    {p.split('/').pop()}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Active run banners */}
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

      {/* Header + Filters */}
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
          <Dropdown
            trigger={
              <Button variant="outline" size="sm">
                {selectedCommandLabel}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </Button>
            }
          >
            {COMMAND_OPTIONS.map((opt) => (
              <DropdownItem
                key={opt.value}
                onClick={() => setCommandFilter(opt.value)}
              >
                {opt.label}
              </DropdownItem>
            ))}
          </Dropdown>
          <Dropdown
            trigger={
              <Button variant="outline" size="sm">
                {selectedSourceLabel}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </Button>
            }
          >
            {SOURCE_OPTIONS.map((opt) => (
              <DropdownItem
                key={opt.value}
                onClick={() => setSourceFilter(opt.value)}
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
