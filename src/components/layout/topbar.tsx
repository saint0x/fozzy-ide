import { Search, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/app-store';
import { useActiveRuns, useActiveWorkspace } from '@/hooks/use-data';

const sectionLabels: Record<string, string> = {
  overview: 'Overview',
  projects: 'Projects',
  tests: 'Tests',
  runs: 'Runs',
  traces: 'Traces',
  telemetry: 'Telemetry',
  editor: 'Editor',
  artifacts: 'Artifacts',
  settings: 'Settings',
};

export function Topbar() {
  const activeSection = useAppStore((s) => s.activeSection);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const { data: activeRuns } = useActiveRuns();
  const workspace = useActiveWorkspace();

  const hasActiveRuns = activeRuns && activeRuns.length > 0;

  return (
    <header className="flex items-center h-[var(--topbar-height)] border-b border-border-default bg-bg-secondary px-4 shrink-0">
      {/* Left: Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-text-tertiary">Fozzy</span>
        <span className="text-text-muted">/</span>
        <span className="text-text-primary font-medium">
          {sectionLabels[activeSection] ?? activeSection}
        </span>
      </div>

      {/* Center: Command palette trigger */}
      <div className="flex-1 flex justify-center">
        <button
          onClick={() => setCommandPaletteOpen(true)}
          className={cn(
            'flex items-center gap-2 px-3 py-1 rounded-md',
            'border border-border-default bg-bg-primary',
            'text-xs text-text-muted hover:text-text-secondary hover:border-border-emphasis',
            'transition-colors duration-150 w-64',
          )}
        >
          <Search className="h-3 w-3" />
          <span className="flex-1 text-left">Search or run command...</span>
          <kbd className="text-[10px] font-mono text-text-muted bg-bg-tertiary px-1 rounded">
            {'\u2318'}K
          </kbd>
        </button>
      </div>

      {/* Right: Indicators */}
      <div className="flex items-center gap-3">
        {/* Active runs indicator */}
        {hasActiveRuns && (
          <div className="flex items-center gap-1.5 text-xs text-accent-primary">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent-primary animate-pulse-dot" />
            <span className="font-medium">{activeRuns.length} running</span>
          </div>
        )}

        {/* Notifications */}
        <button className="p-1 text-text-tertiary hover:text-text-secondary transition-colors duration-150 rounded-md hover:bg-bg-hover">
          <Bell className="h-3.5 w-3.5" />
        </button>

        {/* Workspace indicator */}
        {workspace && (
          <div className="text-xs text-text-secondary truncate max-w-[120px]">
            {workspace.name}
          </div>
        )}
      </div>
    </header>
  );
}
