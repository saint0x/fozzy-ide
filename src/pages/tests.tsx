import { useEffect, useState, useMemo } from 'react';
import { useAppStore } from '@/stores/app-store';
import { useProjects, useRunAllScenarios, useScenarios, useRunScenario } from '@/hooks/use-data';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusDot } from '@/components/ui/status-dot';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { cn, formatDuration, formatRelativeTime } from '@/lib/utils';
import type { Scenario, ScenarioType, ScenarioStatus } from '@/types';

// ── Constants ────────────────────────────────────────────────────────────────

const ALL_TYPES: ScenarioType[] = ['run', 'test', 'fuzz', 'explore', 'memory', 'host', 'generated'];
const ALL_STATUSES: ScenarioStatus[] = ['passing', 'failing', 'flaky', 'skipped', 'unknown'];

const typeColors: Record<ScenarioType, string> = {
  run: 'bg-accent-primary/10 text-accent-primary',
  test: 'bg-success/10 text-success',
  fuzz: 'bg-warning/10 text-warning',
  explore: 'bg-purple-500/10 text-purple-400',
  memory: 'bg-orange-500/10 text-orange-400',
  host: 'bg-cyan-500/10 text-cyan-400',
  generated: 'bg-pink-500/10 text-pink-400',
};

type SortKey = 'name' | 'status' | 'type' | 'lastRun' | 'duration';

// ── Filter Toggle ────────────────────────────────────────────────────────────

function FilterToggle<T extends string>({
  options,
  selected,
  onChange,
  colorFn,
}: {
  options: T[];
  selected: Set<T>;
  onChange: (next: Set<T>) => void;
  colorFn?: (opt: T) => string;
}) {
  function toggle(opt: T) {
    const next = new Set(selected);
    if (next.has(opt)) {
      next.delete(opt);
    } else {
      next.add(opt);
    }
    onChange(next);
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {options.map((opt) => {
        const isActive = selected.has(opt);
        return (
          <button
            key={opt}
            onClick={() => toggle(opt)}
            className={cn(
              'inline-flex items-center rounded-md px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer',
              isActive
                ? colorFn?.(opt) ?? 'bg-accent-primary/15 text-accent-primary'
                : 'bg-bg-tertiary text-text-tertiary hover:text-text-secondary hover:bg-bg-hover',
            )}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

// ── Sort Select ──────────────────────────────────────────────────────────────

function SortSelect({
  value,
  onChange,
}: {
  value: SortKey;
  onChange: (v: SortKey) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SortKey)}
      className={cn(
        'h-8 rounded-md border border-border-default bg-bg-secondary px-2 text-xs text-text-secondary',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-primary',
        'cursor-pointer',
      )}
    >
      <option value="name">Name</option>
      <option value="status">Status</option>
      <option value="type">Type</option>
      <option value="lastRun">Last Run</option>
      <option value="duration">Duration</option>
    </select>
  );
}

// ── Summary Bar ──────────────────────────────────────────────────────────────

function SummaryBar({ scenarios }: { scenarios: Scenario[] }) {
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of scenarios) {
      c[s.status] = (c[s.status] ?? 0) + 1;
    }
    return c;
  }, [scenarios]);

  return (
    <div className="flex items-center gap-3 text-xs text-text-secondary">
      <span className="font-medium text-text-primary">
        {scenarios.length} scenario{scenarios.length !== 1 ? 's' : ''}
      </span>
      {counts.passing ? (
        <span className="text-success">{counts.passing} passing</span>
      ) : null}
      {counts.failing ? (
        <span className="text-error">{counts.failing} failing</span>
      ) : null}
      {counts.flaky ? (
        <span className="text-warning">{counts.flaky} flaky</span>
      ) : null}
      {counts.skipped ? (
        <span className="text-text-tertiary">{counts.skipped} skipped</span>
      ) : null}
    </div>
  );
}

// ── Scenario Row ─────────────────────────────────────────────────────────────

function ScenarioRow({
  scenario,
  onRun,
  isRunning,
}: {
  scenario: Scenario;
  onRun: (id: string) => void;
  isRunning: boolean;
}) {
  return (
    <tr className="group hover:bg-bg-hover transition-colors border-b border-border-muted last:border-b-0">
      {/* Status */}
      <td className="py-2.5 px-3 w-8">
        <StatusDot status={scenario.status} />
      </td>
      {/* Name */}
      <td className="py-2.5 pr-3">
        <span className="text-sm font-medium text-text-primary font-mono">
          {scenario.name}
        </span>
      </td>
      {/* Type */}
      <td className="py-2.5 pr-3">
        <span
          className={cn(
            'inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium',
            typeColors[scenario.type],
          )}
        >
          {scenario.type}
        </span>
      </td>
      {/* File path + line */}
      <td className="py-2.5 pr-3 max-w-[200px]">
        <span className="text-xs text-text-tertiary truncate block" title={scenario.filePath}>
          {scenario.filePath}
        </span>
        <span className="text-[10px] text-text-muted">:{scenario.line}</span>
      </td>
      {/* Last run */}
      <td className="py-2.5 pr-3">
        <span className="text-xs text-text-tertiary">
          {scenario.lastRun ? formatRelativeTime(scenario.lastRun) : '\u2014'}
        </span>
      </td>
      {/* Duration */}
      <td className="py-2.5 pr-3">
        <span className="text-xs text-text-tertiary">
          {scenario.duration != null ? formatDuration(scenario.duration) : '\u2014'}
        </span>
      </td>
      {/* Tags */}
      <td className="py-2.5 pr-3">
        <div className="flex items-center gap-1 flex-wrap">
          {scenario.tags.map((tag) => (
            <Badge key={tag} variant="outline" size="sm">
              {tag}
            </Badge>
          ))}
        </div>
      </td>
      {/* Actions */}
      <td className="py-2.5 pr-3 w-10">
        <Button
          variant="ghost"
          size="icon"
          loading={isRunning}
          onClick={(e) => {
            e.stopPropagation();
            onRun(scenario.id);
          }}
          title="Run test"
        >
          {!isRunning && <span className="text-xs">&#9654;</span>}
        </Button>
      </td>
    </tr>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function TestsPage() {
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const setActiveSection = useAppStore((s) => s.setActiveSection);

  useEffect(() => {
    setActiveSection('tests');
  }, [setActiveSection]);

  const { data: scenarios, isLoading } = useScenarios();
  const { data: projects } = useProjects(activeWorkspaceId);
  const primaryProject = projects?.[0] ?? null;
  const runMutation = useRunScenario();
  const runAllMutation = useRunAllScenarios();

  // Filters
  const [selectedTypes, setSelectedTypes] = useState<Set<ScenarioType>>(new Set());
  const [selectedStatuses, setSelectedStatuses] = useState<Set<ScenarioStatus>>(new Set());
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [runningId, setRunningId] = useState<string | null>(null);

  function handleRun(scenarioId: string) {
    setRunningId(scenarioId);
    runMutation.mutate(scenarioId, {
      onSettled: () => setRunningId(null),
    });
  }

  // Filter + sort
  const filtered = useMemo(() => {
    if (!scenarios) return [];

    let result = [...scenarios];

    // Type filter
    if (selectedTypes.size > 0) {
      result = result.filter((s) => selectedTypes.has(s.type));
    }

    // Status filter
    if (selectedStatuses.size > 0) {
      result = result.filter((s) => selectedStatuses.has(s.status));
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.filePath.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }

    // Sort
    result.sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'status':
          return a.status.localeCompare(b.status);
        case 'type':
          return a.type.localeCompare(b.type);
        case 'lastRun': {
          const aTime = a.lastRun ? new Date(a.lastRun).getTime() : 0;
          const bTime = b.lastRun ? new Date(b.lastRun).getTime() : 0;
          return bTime - aTime;
        }
        case 'duration':
          return (b.duration ?? 0) - (a.duration ?? 0);
        default:
          return 0;
      }
    });

    return result;
  }, [scenarios, selectedTypes, selectedStatuses, search, sortKey]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!scenarios || scenarios.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          title="No tests found"
          description="Scan a project to discover tests and scenarios."
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text-primary">Tests</h1>
        <Button
          variant="primary"
          size="md"
          loading={runAllMutation.isPending}
          disabled={!primaryProject}
          onClick={() => {
            if (!primaryProject) return;
            runAllMutation.mutate(primaryProject.id);
          }}
        >
          Run All
        </Button>
      </div>

      {/* Filter Bar */}
      <div className="space-y-3">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-tertiary shrink-0">Type</span>
            <FilterToggle
              options={ALL_TYPES}
              selected={selectedTypes}
              onChange={setSelectedTypes}
              colorFn={(t) => typeColors[t]}
            />
          </div>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-tertiary shrink-0">Status</span>
            <FilterToggle
              options={ALL_STATUSES}
              selected={selectedStatuses}
              onChange={setSelectedStatuses}
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-64">
            <Input
              placeholder="Search by name, path, or tag..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <SortSelect value={sortKey} onChange={setSortKey} />
        </div>
      </div>

      {/* Summary */}
      <SummaryBar scenarios={filtered} />

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No matching tests"
          description="Try adjusting your filters."
        />
      ) : (
        <div className="rounded-lg border border-border-default bg-bg-secondary overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border-default">
                <th className="py-2 px-3 w-8" />
                <th className="py-2 pr-3 text-xs font-medium text-text-tertiary">Name</th>
                <th className="py-2 pr-3 text-xs font-medium text-text-tertiary">Type</th>
                <th className="py-2 pr-3 text-xs font-medium text-text-tertiary">File</th>
                <th className="py-2 pr-3 text-xs font-medium text-text-tertiary">Last Run</th>
                <th className="py-2 pr-3 text-xs font-medium text-text-tertiary">Duration</th>
                <th className="py-2 pr-3 text-xs font-medium text-text-tertiary">Tags</th>
                <th className="py-2 pr-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((scenario) => (
                <ScenarioRow
                  key={scenario.id}
                  scenario={scenario}
                  onRun={handleRun}
                  isRunning={runningId === scenario.id}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
