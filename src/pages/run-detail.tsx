import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useRun, useArtifacts, useTraces, useCancelRun } from '@/hooks/use-data';
import { useAppStore } from '@/stores/app-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/ui/status-dot';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabList, Tab, TabPanel } from '@/components/ui/tabs';
import { cn, formatDuration, formatRelativeTime, formatBytes, getStatusBgColor } from '@/lib/utils';
import type { RunState } from '@/types';

function stateToVariant(state: RunState) {
  switch (state) {
    case 'passed': return 'success' as const;
    case 'failed': case 'timeout': return 'error' as const;
    case 'running': case 'queued': return 'info' as const;
    case 'cancelled': return 'default' as const;
  }
}

function artifactTypeVariant(type: string) {
  switch (type) {
    case 'report': return 'info' as const;
    case 'log': return 'default' as const;
    case 'coverage': return 'success' as const;
    case 'trace': return 'warning' as const;
    case 'screenshot': return 'info' as const;
    case 'binary': return 'default' as const;
    default: return 'default' as const;
  }
}

export default function RunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const setActiveSection = useAppStore((s) => s.setActiveSection);

  const initialTab = (location.state as { tab?: string } | null)?.tab ?? 'output';
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    setActiveSection('runs');
  }, [setActiveSection]);

  const runQuery = useRun(id ?? '');
  const artifactsQuery = useArtifacts(id);
  const tracesQuery = useTraces(id);
  const cancelMutation = useCancelRun();

  const run = runQuery.data;
  const artifacts = artifactsQuery.data ?? [];
  const traces = tracesQuery.data ?? [];
  const trace = traces[0] ?? null;

  if (runQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" className="text-text-tertiary" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState title="Run not found" description="This run may have been deleted." />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/runs')}
          aria-label="Back to runs"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-text-primary truncate">
              {run.scenarioName}
            </h1>
            <Badge variant={stateToVariant(run.state)} dot={run.state === 'running'}>
              {run.state}
            </Badge>
          </div>
          <p className="text-xs text-text-tertiary mt-0.5">
            {run.projectName} &middot; {formatRelativeTime(run.startedAt)}
            {run.duration != null && <> &middot; {formatDuration(run.duration)}</>}
          </p>
        </div>
        {(run.state === 'running' || run.state === 'queued') && (
          <Button
            variant="danger"
            size="sm"
            loading={cancelMutation.isPending}
            onClick={() => cancelMutation.mutate(run.id)}
          >
            Cancel Run
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabList>
          <Tab value="output">Output</Tab>
          <Tab value="artifacts">
            Artifacts{artifacts.length > 0 && ` (${artifacts.length})`}
          </Tab>
          <Tab value="trace">Trace</Tab>
        </TabList>

        {/* Output tab */}
        <TabPanel value="output" className="mt-4 space-y-4">
          {/* Stdout */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wide">
                stdout
              </h3>
            </div>
            <div className="rounded-lg border border-border-default bg-[#0d0d0d] overflow-hidden">
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <pre className="p-4 text-xs font-mono text-text-primary leading-relaxed whitespace-pre-wrap">
                  {run.stdout.split('\n').map((line, i) => (
                    <div key={i} className="flex">
                      <span className="select-none w-8 shrink-0 text-right pr-3 text-text-tertiary/50">
                        {i + 1}
                      </span>
                      <span>{line}</span>
                    </div>
                  ))}
                </pre>
              </div>
            </div>
          </div>

          {/* Stderr */}
          {run.stderr && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-xs font-medium text-error uppercase tracking-wide">
                  stderr
                </h3>
              </div>
              <div className="rounded-lg border border-error/20 bg-error/5 overflow-hidden">
                <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                  <pre className="p-4 text-xs font-mono text-text-primary leading-relaxed whitespace-pre-wrap">
                    {run.stderr.split('\n').map((line, i) => (
                      <div key={i} className="flex">
                        <span className="select-none w-8 shrink-0 text-right pr-3 text-text-tertiary/50">
                          {i + 1}
                        </span>
                        <span>{line}</span>
                      </div>
                    ))}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* Exit code */}
          {run.exitCode != null && (
            <div className="flex items-center gap-2 pt-2">
              <span className="text-xs text-text-tertiary">Exit code:</span>
              <span
                className={cn(
                  'font-mono text-sm font-medium',
                  run.exitCode !== 0 ? 'text-error' : 'text-success',
                )}
              >
                {run.exitCode}
              </span>
            </div>
          )}
        </TabPanel>

        {/* Artifacts tab */}
        <TabPanel value="artifacts" className="mt-4">
          {artifactsQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner className="text-text-tertiary" />
            </div>
          ) : artifacts.length === 0 ? (
            <EmptyState
              title="No artifacts"
              description="This run did not produce any artifacts."
            />
          ) : (
            <div className="space-y-2">
              {artifacts.map((art) => (
                <div
                  key={art.id}
                  className="flex items-center gap-4 rounded-lg border border-border-default bg-bg-secondary px-4 py-3 hover:bg-bg-hover transition-colors duration-100"
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-text-primary truncate block">
                      {art.name}
                    </span>
                  </div>
                  <Badge variant={artifactTypeVariant(art.type)} size="sm">
                    {art.type}
                  </Badge>
                  <span className="text-xs text-text-tertiary tabular-nums w-20 text-right">
                    {formatBytes(art.size)}
                  </span>
                  <Button variant="outline" size="sm">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" x2="12" y1="15" y2="3" />
                    </svg>
                    Download
                  </Button>
                </div>
              ))}
            </div>
          )}
        </TabPanel>

        {/* Trace tab */}
        <TabPanel value="trace" className="mt-4">
          {tracesQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner className="text-text-tertiary" />
            </div>
          ) : trace ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4 rounded-lg border border-border-default bg-bg-secondary px-4 py-3">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">
                      {trace.scenarioName}
                    </span>
                    <Badge
                      variant={
                        trace.phase === 'verify' ? 'info' :
                        trace.phase === 'replay' ? 'warning' :
                        'error'
                      }
                      size="sm"
                    >
                      {trace.phase}
                    </Badge>
                    <StatusDot status={trace.status} pulse={trace.status === 'running'} />
                    <span className="text-xs text-text-secondary">{trace.status}</span>
                  </div>
                  <p className="text-xs text-text-tertiary">
                    {trace.steps.length} step{trace.steps.length !== 1 ? 's' : ''}
                    {' '}&middot;{' '}Input: {formatBytes(trace.inputSize)}
                    {trace.shrunkSize != null && <> &middot; Shrunk: {formatBytes(trace.shrunkSize)}</>}
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => navigate(`/traces/${trace.id}`)}
                >
                  View full trace
                </Button>
              </div>
            </div>
          ) : (
            <EmptyState
              title="No trace available"
              description="No trace was recorded for this run."
            />
          )}
        </TabPanel>
      </Tabs>
    </div>
  );
}
