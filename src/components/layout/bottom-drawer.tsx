import { useRef, useCallback, useEffect, useState } from 'react';
import { X, Minus, GripHorizontal, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/app-store';
import type { DrawerTab } from '@/stores/app-store';

const tabs: { value: DrawerTab; label: string }[] = [
  { value: 'terminal', label: 'Terminal' },
  { value: 'output', label: 'Output' },
  { value: 'problems', label: 'Problems' },
];

const mockProblems = [
  { severity: 'error' as const, message: 'Cannot find module \'@/missing\'', file: 'src/app.ts', line: 12, col: 5 },
  { severity: 'warning' as const, message: 'Unused variable \'count\'', file: 'src/lib/utils.ts', line: 34, col: 7 },
  { severity: 'info' as const, message: 'Consider using optional chaining', file: 'src/hooks/use-data.ts', line: 8, col: 15 },
];

const mockOutput = [
  '[10:32:01] Starting build...',
  '[10:32:01] Compiling TypeScript...',
  '[10:32:03] 0 errors, 1 warning',
  '[10:32:03] Build completed in 2.1s',
  '[10:32:05] Running test suite...',
  '[10:32:06] PASS src/lib/utils.test.ts',
  '[10:32:07] PASS src/hooks/use-data.test.ts',
  '[10:32:07] Tests: 14 passed, 0 failed',
];

export function BottomDrawer() {
  const drawerOpen = useAppStore((s) => s.drawerOpen);
  const drawerHeight = useAppStore((s) => s.drawerHeight);
  const drawerTab = useAppStore((s) => s.drawerTab);
  const toggleDrawer = useAppStore((s) => s.toggleDrawer);
  const setDrawerHeight = useAppStore((s) => s.setDrawerHeight);
  const setDrawerTab = useAppStore((s) => s.setDrawerTab);

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
              <span className="ml-1 text-[10px] text-error">{mockProblems.length}</span>
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
                <span className="ml-1 text-[10px] text-error">{mockProblems.length}</span>
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
        {drawerTab === 'problems' && <ProblemsPanel />}
      </div>
    </div>
  );
}

function TerminalPanel() {
  const [cursorVisible, setCursorVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => setCursorVisible((v) => !v), 530);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-3 font-mono text-xs text-text-secondary leading-relaxed">
      <div className="text-text-muted">Last login: Mon Apr 6 09:15:23 on ttys001</div>
      <div>
        <span className="text-accent-primary">~/workspace</span>
        <span className="text-text-muted"> $ </span>
        <span className="text-text-primary">fozzy run --all</span>
      </div>
      <div className="text-success">Running 14 scenarios...</div>
      <div className="text-text-muted">
        <span className="text-accent-primary">~/workspace</span>
        <span className="text-text-muted"> $ </span>
        <span
          className={cn(
            'inline-block w-1.5 h-3.5 bg-text-primary align-text-bottom',
            !cursorVisible && 'opacity-0',
          )}
        />
      </div>
    </div>
  );
}

function OutputPanel() {
  return (
    <div className="p-3 font-mono text-xs text-text-secondary leading-relaxed space-y-0.5">
      {mockOutput.map((line, i) => (
        <div key={i} className={cn(line.includes('PASS') && 'text-success', line.includes('FAIL') && 'text-error')}>
          {line}
        </div>
      ))}
    </div>
  );
}

function ProblemsPanel() {
  const severityIcon = {
    error: <AlertCircle className="h-3.5 w-3.5 text-error shrink-0" />,
    warning: <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />,
    info: <Info className="h-3.5 w-3.5 text-info shrink-0" />,
  };

  return (
    <div className="divide-y divide-border-muted">
      {mockProblems.map((problem, i) => (
        <div key={i} className="flex items-start gap-2 px-3 py-2 hover:bg-bg-hover transition-colors cursor-default">
          {severityIcon[problem.severity]}
          <div className="flex-1 min-w-0">
            <div className="text-xs text-text-primary">{problem.message}</div>
            <div className="text-[10px] text-text-muted mt-0.5">
              {problem.file}:{problem.line}:{problem.col}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
