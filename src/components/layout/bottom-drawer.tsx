import { useRef, useCallback, useEffect, useState } from 'react';
import { X, Minus, GripHorizontal, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/app-store';
import { useActiveRuns, useDiagnostics, useRunEvents, useRuns, useRunTerminalCommand, useTerminalSessions } from '@/hooks/use-data';
import type { DrawerTab } from '@/stores/app-store';

const tabs: { value: DrawerTab; label: string }[] = [
  { value: 'terminal', label: 'Terminal' },
  { value: 'output', label: 'Output' },
  { value: 'problems', label: 'Problems' },
];

export function BottomDrawer() {
  const drawerOpen = useAppStore((s) => s.drawerOpen);
  const drawerHeight = useAppStore((s) => s.drawerHeight);
  const drawerTab = useAppStore((s) => s.drawerTab);
  const toggleDrawer = useAppStore((s) => s.toggleDrawer);
  const setDrawerHeight = useAppStore((s) => s.setDrawerHeight);
  const setDrawerTab = useAppStore((s) => s.setDrawerTab);
  const loadProblems = drawerOpen && drawerTab === 'problems';
  const { data: diagnostics } = useDiagnostics(loadProblems);
  const problems = diagnostics ?? [];

  const dragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startY.current = e.clientY;
      startHeight.current = drawerHeight;
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
    },
    [drawerHeight],
  );

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!dragging.current) return;
      const delta = startY.current - e.clientY;
      const newHeight = Math.max(120, Math.min(600, startHeight.current + delta));
      setDrawerHeight(newHeight);
    }

    function handleMouseUp() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [setDrawerHeight]);

  if (!drawerOpen) {
    return (
      <div className="flex items-center h-[var(--drawer-min-height)] border-t border-border-default bg-bg-secondary px-2 shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setDrawerTab(tab.value)}
            className={cn(
              'px-3 py-1 text-[11px] text-text-tertiary hover:text-text-secondary transition-colors duration-150',
              drawerTab === tab.value && 'text-text-secondary',
            )}
          >
            {tab.label}
            {tab.value === 'problems' && (
              <span className="ml-1 text-[10px] text-error">{problems.length}</span>
            )}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      className="flex flex-col border-t border-border-default bg-bg-secondary shrink-0"
      style={{ height: drawerHeight }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={handleMouseDown}
        className="flex items-center justify-center h-1.5 cursor-ns-resize group hover:bg-accent-primary/20 transition-colors"
      >
        <GripHorizontal className="h-3 w-3 text-text-muted group-hover:text-text-secondary" />
      </div>

      {/* Tab bar */}
      <div className="flex items-center border-b border-border-default px-2 shrink-0">
        <div className="flex items-center flex-1 gap-0">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setDrawerTab(tab.value)}
              className={cn(
                'relative px-3 py-1.5 text-[11px] font-medium transition-colors duration-150',
                drawerTab === tab.value
                  ? 'text-text-primary'
                  : 'text-text-tertiary hover:text-text-secondary',
              )}
            >
              {tab.label}
              {tab.value === 'problems' && (
                <span className="ml-1 text-[10px] text-error">{problems.length}</span>
              )}
              {drawerTab === tab.value && (
                <span className="absolute bottom-0 left-0 right-0 h-px bg-accent-primary" />
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={toggleDrawer}
            className="p-1 text-text-muted hover:text-text-secondary transition-colors rounded"
          >
            <Minus className="h-3 w-3" />
          </button>
          <button
            onClick={toggleDrawer}
            className="p-1 text-text-muted hover:text-text-secondary transition-colors rounded"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {drawerTab === 'terminal' && <TerminalPanel />}
        {drawerTab === 'output' && <OutputPanel />}
        {drawerTab === 'problems' && <ProblemsPanel problems={problems} />}
      </div>
    </div>
  );
}

function TerminalPanel() {
  const terminalSessions = useTerminalSessions(true);
  const runTerminalCommand = useRunTerminalCommand();
  const [cursorVisible, setCursorVisible] = useState(true);
  const bootstrapCommand = 'pwd && git status --short && ls -la';

  useEffect(() => {
    const interval = setInterval(() => setCursorVisible((v) => !v), 530);
    return () => clearInterval(interval);
  }, []);

  const sessions = terminalSessions.data ?? [];
  const latest = sessions[0];

  useEffect(() => {
    if (terminalSessions.isLoading) return;
    if (latest) return;
    if (runTerminalCommand.isPending) return;
    runTerminalCommand.mutate(bootstrapCommand);
  }, [bootstrapCommand, latest, runTerminalCommand, terminalSessions.isLoading]);

  return (
    <div className="p-3 font-mono text-xs text-text-secondary leading-relaxed">
      <div className="flex items-center justify-between mb-2">
        <div className="text-text-muted">Local terminal context</div>
        <button
          onClick={() => runTerminalCommand.mutate(bootstrapCommand)}
          className="text-text-muted hover:text-text-secondary transition-colors"
        >
          Refresh
        </button>
      </div>
      {latest ? (
        <>
          <div>
            <span className="text-accent-primary">{latest.cwd}</span>
            <span className="text-text-muted"> $ </span>
            <span className="text-text-primary">{latest.shell}</span>
          </div>
          <pre className="mt-2 whitespace-pre-wrap text-text-secondary">
            {latest.lastOutput || '[no output]'}
          </pre>
        </>
      ) : (
        <div className="text-text-muted">
          <span className="text-accent-primary">~/.fozzy-ide</span>
          <span className="text-text-muted"> $ </span>
          <span
            className={cn(
              'inline-block w-1.5 h-3.5 bg-text-primary align-text-bottom',
              !cursorVisible && 'opacity-0',
            )}
          />
        </div>
      )}
    </div>
  );
}

function OutputPanel() {
  const activeRunsQuery = useActiveRuns(true);
  const runsQuery = useRuns({ limit: 8 }, true);
  const runEventsQuery = useRunEvents(true);
  const activeRuns = activeRunsQuery.data ?? [];
  const recentRuns = runsQuery.data ?? [];
  const activeOutputLines = activeRuns.flatMap((run) => {
    const header = `[${new Date(run.startedAt).toLocaleTimeString()}] RUNNING ${run.scenarioName} (${run.projectName})`;
    const stdoutLines = run.stdout.split('\n').filter(Boolean).slice(-6);
    const stderrLines = run.stderr.split('\n').filter(Boolean).slice(-4);
    return [header, ...stdoutLines, ...stderrLines];
  });
  const lines = recentRuns.flatMap((run) => {
    const summary = [`[${new Date(run.startedAt).toLocaleTimeString()}] ${run.state.toUpperCase()} ${run.scenarioName}`];
    const stdoutLines = run.stdout.split('\n').filter(Boolean).slice(0, 3);
    const stderrLines = run.stderr.split('\n').filter(Boolean).slice(0, 2);
    return [...summary, ...stdoutLines, ...stderrLines];
  });
  const eventLines = (runEventsQuery.data ?? [])
    .slice(-12)
    .map((event) => {
      const details =
        event.kind === 'runFinished'
          ? `${String(event.payload.status ?? 'finished').toUpperCase()} exit=${String(event.payload.exitCode ?? '--')}`
          : event.kind;
      return `[${new Date(event.at).toLocaleTimeString()}] ${details}`;
    });
  const mergedLines = [...activeOutputLines, ...eventLines, ...lines]
    .filter(Boolean)
    .slice(0, 48);

  return (
    <div className="p-3 font-mono text-xs text-text-secondary leading-relaxed space-y-0.5">
      {mergedLines.length === 0 && <div className="text-text-muted">No run output yet.</div>}
      {mergedLines.map((line, i) => (
        <div key={i} className={cn(line.includes('PASSED') && 'text-success', line.includes('FAILED') && 'text-error')}>
          {line}
        </div>
      ))}
    </div>
  );
}

function ProblemsPanel({
  problems,
}: {
  problems: Array<{ severity: 'error' | 'warning' | 'info' | 'hint'; message: string; filePath: string; line: number; column: number }>;
}) {
  const severityIcon = {
    error: <AlertCircle className="h-3.5 w-3.5 text-error shrink-0" />,
    warning: <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />,
    info: <Info className="h-3.5 w-3.5 text-info shrink-0" />,
    hint: <Info className="h-3.5 w-3.5 text-info shrink-0" />,
  };

  return (
    <div className="divide-y divide-border-muted">
      {problems.length === 0 && (
        <div className="px-3 py-2 text-xs text-text-muted">No diagnostics.</div>
      )}
      {problems.map((problem, i) => (
        <div key={i} className="flex items-start gap-2 px-3 py-2 hover:bg-bg-hover transition-colors cursor-default">
          {severityIcon[problem.severity]}
          <div className="flex-1 min-w-0">
            <div className="text-xs text-text-primary">{problem.message}</div>
            <div className="text-[10px] text-text-muted mt-0.5">
              {problem.filePath}:{problem.line}:{problem.column}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
