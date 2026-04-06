import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTraces } from '@/hooks/use-data';
import { useAppStore } from '@/stores/app-store';
import { Badge } from '@/components/ui/badge';
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

export default function TracesPage() {
  const setActiveSection = useAppStore((s) => s.setActiveSection);
  const navigate = useNavigate();

  useEffect(() => {
    setActiveSection('traces');
  }, [setActiveSection]);

  const tracesQuery = useTraces();
  const traces = tracesQuery.data ?? [];

  if (tracesQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" className="text-text-tertiary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto">
      {/* Header */}
      <h1 className="text-lg font-semibold text-text-primary">Traces</h1>

      {traces.length === 0 ? (
        <EmptyState
          title="No traces"
          description="Traces will appear here after a run records deterministic replay data."
        />
      ) : (
        <div className="rounded-lg border border-border-default overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-default bg-bg-tertiary text-text-tertiary text-xs">
                <th className="text-left font-medium px-4 py-2">Scenario</th>
                <th className="text-left font-medium px-4 py-2">Phase</th>
                <th className="text-left font-medium px-4 py-2">Status</th>
                <th className="text-left font-medium px-4 py-2">Run</th>
                <th className="text-left font-medium px-4 py-2">Input</th>
                <th className="text-left font-medium px-4 py-2">Shrunk</th>
                <th className="text-left font-medium px-4 py-2">Started</th>
                <th className="text-left font-medium px-4 py-2">Finished</th>
                <th className="text-right font-medium px-4 py-2">Steps</th>
              </tr>
            </thead>
            <tbody>
              {traces.map((trace) => (
                <tr
                  key={trace.id}
                  onClick={() => navigate(`/traces/${trace.id}`)}
                  className="border-b border-border-default last:border-b-0 hover:bg-bg-hover cursor-default transition-colors duration-100"
                >
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-text-primary">
                      {trace.scenarioName}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={phaseVariant(trace.phase)} size="sm">
                      {trace.phase}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <StatusDot
                        status={trace.status}
                        pulse={trace.status === 'running'}
                      />
                      <span className="text-xs text-text-secondary">
                        {trace.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/runs/${trace.runId}`);
                      }}
                      className="text-xs text-accent-primary hover:underline"
                    >
                      {trace.runId}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-text-secondary tabular-nums">
                    {formatBytes(trace.inputSize)}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-text-secondary tabular-nums">
                    {trace.shrunkSize != null ? formatBytes(trace.shrunkSize) : '--'}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-text-secondary">
                    {formatRelativeTime(trace.startedAt)}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-text-secondary">
                    {trace.finishedAt ? formatRelativeTime(trace.finishedAt) : '--'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-text-secondary tabular-nums">
                    {trace.steps.length}
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
