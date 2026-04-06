import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTrace, useReplayTrace, useShrinkTrace } from '@/hooks/use-data';
import { useAppStore } from '@/stores/app-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/ui/status-dot';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { cn, formatBytes, formatRelativeTime } from '@/lib/utils';

function phaseVariant(phase: string) {
  switch (phase) {
    case 'verify': return 'info' as const;
    case 'replay': return 'warning' as const;
    case 'shrink': return 'error' as const;
    default: return 'default' as const;
  }
}

export default function TraceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const setActiveSection = useAppStore((s) => s.setActiveSection);

  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  useEffect(() => {
    setActiveSection('traces');
  }, [setActiveSection]);

  const traceQuery = useTrace(id ?? '');
  const replayMutation = useReplayTrace();
  const shrinkMutation = useShrinkTrace();

  const trace = traceQuery.data;

  function toggleStep(stepId: string) {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  }

  if (traceQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" className="text-text-tertiary" />
      </div>
    );
  }

  if (!trace) {
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState title="Trace not found" description="This trace may have been deleted." />
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
          onClick={() => navigate('/traces')}
          aria-label="Back to traces"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-text-primary truncate">
              {trace.scenarioName}
            </h1>
            <Badge variant={phaseVariant(trace.phase)}>
              {trace.phase}
            </Badge>
            <StatusDot status={trace.status} pulse={trace.status === 'running'} />
            <span className="text-xs text-text-secondary">{trace.status}</span>
          </div>
        </div>
      </div>

      {/* Info panel */}
      <div className="flex items-center gap-6 rounded-lg border border-border-default bg-bg-secondary px-4 py-3">
        <div>
          <span className="text-xs text-text-tertiary block">Input size</span>
          <span className="text-sm text-text-primary tabular-nums">{formatBytes(trace.inputSize)}</span>
        </div>
        {trace.shrunkSize != null && (
          <div>
            <span className="text-xs text-text-tertiary block">Shrunk size</span>
            <span className="text-sm text-text-primary tabular-nums">{formatBytes(trace.shrunkSize)}</span>
          </div>
        )}
        <div>
          <span className="text-xs text-text-tertiary block">Started</span>
          <span className="text-sm text-text-secondary">{formatRelativeTime(trace.startedAt)}</span>
        </div>
        {trace.finishedAt && (
          <div>
            <span className="text-xs text-text-tertiary block">Finished</span>
            <span className="text-sm text-text-secondary">{formatRelativeTime(trace.finishedAt)}</span>
          </div>
        )}
        <div>
          <span className="text-xs text-text-tertiary block">Steps</span>
          <span className="text-sm text-text-primary tabular-nums">{trace.steps.length}</span>
        </div>
        <div>
          <span className="text-xs text-text-tertiary block">Run</span>
          <button
            onClick={() => navigate(`/runs/${trace.runId}`)}
            className="text-sm text-accent-primary hover:underline"
          >
            {trace.runId}
          </button>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          size="sm"
          loading={replayMutation.isPending}
          onClick={() => replayMutation.mutate(trace.id)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="6 3 20 12 6 21 6 3" />
          </svg>
          Replay
        </Button>
        {trace.phase !== 'shrink' && (
          <Button
            variant="outline"
            size="sm"
            loading={shrinkMutation.isPending}
            onClick={() => shrinkMutation.mutate(trace.id)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 14 10 14 10 20" />
              <polyline points="20 10 14 10 14 4" />
              <line x1="14" x2="21" y1="10" y2="3" />
              <line x1="3" x2="10" y1="21" y2="14" />
            </svg>
            Shrink
          </Button>
        )}
      </div>

      {/* Steps timeline */}
      <div>
        <h2 className="text-sm font-medium text-text-secondary mb-4">Steps</h2>
        {trace.steps.length === 0 ? (
          <EmptyState title="No steps" description="This trace has no recorded steps." />
        ) : (
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border-default" />

            <div className="space-y-0">
              {trace.steps.map((step, i) => {
                const isExpanded = expandedSteps.has(step.id);
                const isLast = i === trace.steps.length - 1;

                return (
                  <div key={step.id} className="relative pl-8">
                    {/* Timeline dot */}
                    <div
                      className={cn(
                        'absolute left-1.5 top-3 h-3 w-3 rounded-full border-2 z-10',
                        step.passed
                          ? 'border-success bg-bg-primary'
                          : 'border-error bg-error/20',
                      )}
                    />

                    <button
                      onClick={() => toggleStep(step.id)}
                      className={cn(
                        'w-full text-left rounded-lg px-4 py-3 transition-colors duration-100',
                        !step.passed && 'bg-error/5 border border-error/20',
                        step.passed && 'hover:bg-bg-hover',
                        !isLast && 'mb-1',
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] text-text-tertiary tabular-nums shrink-0">
                          {new Date(step.timestamp).toLocaleTimeString(undefined, {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            fractionalSecondDigits: 3,
                          })}
                        </span>
                        <span className="text-sm font-medium text-text-primary">
                          {step.action}
                        </span>
                        {!step.passed && (
                          <Badge variant="error" size="sm">FAIL</Badge>
                        )}
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={cn(
                            'ml-auto shrink-0 text-text-tertiary transition-transform duration-150',
                            isExpanded && 'rotate-180',
                          )}
                        >
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </div>

                      {isExpanded && (
                        <div className="mt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
                          <div>
                            <span className="text-[10px] text-text-tertiary uppercase tracking-wide block mb-1">
                              Input
                            </span>
                            <pre className="text-xs font-mono text-text-secondary bg-[#0d0d0d] rounded px-3 py-2 overflow-x-auto whitespace-pre-wrap">
                              {step.input}
                            </pre>
                          </div>
                          <div>
                            <span className="text-[10px] text-text-tertiary uppercase tracking-wide block mb-1">
                              Output
                            </span>
                            <pre
                              className={cn(
                                'text-xs font-mono rounded px-3 py-2 overflow-x-auto whitespace-pre-wrap',
                                step.passed
                                  ? 'text-text-secondary bg-[#0d0d0d]'
                                  : 'text-error bg-error/5',
                              )}
                            >
                              {step.output}
                            </pre>
                          </div>
                        </div>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
