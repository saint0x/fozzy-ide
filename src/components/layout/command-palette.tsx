import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  LayoutDashboard,
  FolderKanban,
  TestTubes,
  Play,
  GitBranch,
  Activity,
  Code,
  Archive,
  Settings,
  Terminal,
  PanelLeftClose,
} from 'lucide-react';
import { appDataProvider } from '@/data/provider';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/app-store';

interface Command {
  id: string;
  label: string;
  group: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
  keywords?: string;
}

export function CommandPalette() {
  const open = useAppStore((s) => s.commandPaletteOpen);
  const setOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const setDrawerTab = useAppStore((s) => s.setDrawerTab);
  const setActiveSection = useAppStore((s) => s.setActiveSection);
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo<Command[]>(() => {
    const nav = (path: string, label: string, section: string, icon: React.ComponentType<{ className?: string }>) => ({
      id: `nav-${section}`,
      label: `Go to ${label}`,
      group: 'Navigation',
      icon,
      action: () => {
        navigate(path);
        setActiveSection(section);
      },
      keywords: label.toLowerCase(),
    });

    return [
      nav('/', 'Overview', 'overview', LayoutDashboard),
      nav('/projects', 'Projects', 'projects', FolderKanban),
      nav('/tests', 'Tests', 'tests', TestTubes),
      nav('/runs', 'Runs', 'runs', Play),
      nav('/traces', 'Traces', 'traces', GitBranch),
      nav('/telemetry', 'Telemetry', 'telemetry', Activity),
      nav('/editor', 'Editor', 'editor', Code),
      nav('/artifacts', 'Artifacts', 'artifacts', Archive),
      nav('/settings', 'Settings', 'settings', Settings),
      {
        id: 'action-run-all',
        label: 'Run all tests',
        group: 'Actions',
        icon: Play,
        action: async () => {
          navigate('/runs');
          setActiveSection('runs');
          if (!activeWorkspaceId) return;
          await appDataProvider.workflows.execute('strict', false);
        },
        keywords: 'run execute test all',
      },
      {
        id: 'action-terminal',
        label: 'Open terminal',
        group: 'Actions',
        icon: Terminal,
        action: () => setDrawerTab('terminal'),
        keywords: 'terminal shell console',
      },
      {
        id: 'action-toggle-sidebar',
        label: 'Toggle sidebar',
        group: 'Actions',
        icon: PanelLeftClose,
        action: toggleSidebar,
        keywords: 'sidebar collapse expand panel',
      },
    ];
  }, [activeWorkspaceId, navigate, setActiveSection, setDrawerTab, toggleSidebar]);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.keywords?.includes(q) ||
        cmd.group.toLowerCase().includes(q),
    );
  }, [commands, query]);

  const groupedFiltered = useMemo(() => {
    const groups: Record<string, Command[]> = {};
    for (const cmd of filtered) {
      (groups[cmd.group] ??= []).push(cmd);
    }
    return groups;
  }, [filtered]);

  const flatFiltered = filtered;

  const execute = useCallback(
    (cmd: Command) => {
      cmd.action();
      setOpen(false);
      setQuery('');
      setSelectedIndex(0);
    },
    [setOpen],
  );

  // Global keyboard shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(!open);
        if (!open) {
          setQuery('');
          setSelectedIndex(0);
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, setOpen]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Keyboard navigation within palette
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, flatFiltered.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (flatFiltered[selectedIndex]) {
            execute(flatFiltered[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setOpen(false);
          setQuery('');
          setSelectedIndex(0);
          break;
      }
    },
    [flatFiltered, selectedIndex, execute, setOpen],
  );

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-command-item]');
    items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={() => {
          setOpen(false);
          setQuery('');
          setSelectedIndex(0);
        }}
      />

      {/* Palette */}
      <div
        className="relative w-full max-w-lg rounded-lg border border-border-default bg-bg-secondary shadow-2xl animate-slide-down overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 border-b border-border-default">
          <Search className="h-4 w-4 text-text-muted shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search..."
            className="flex-1 h-11 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
          />
          <kbd className="text-[10px] font-mono text-text-muted bg-bg-tertiary px-1.5 py-0.5 rounded border border-border-default">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[300px] overflow-y-auto py-2">
          {flatFiltered.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-text-muted">
              No results found
            </div>
          )}

          {Object.entries(groupedFiltered).map(([group, cmds]) => (
            <div key={group}>
              <div className="px-4 py-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">
                {group}
              </div>
              {cmds.map((cmd) => {
                const index = flatFiltered.indexOf(cmd);
                const Icon = cmd.icon;
                return (
                  <button
                    key={cmd.id}
                    data-command-item
                    onClick={() => execute(cmd)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={cn(
                      'flex items-center gap-3 w-full px-4 py-2 text-left text-xs transition-colors duration-75',
                      index === selectedIndex
                        ? 'bg-bg-hover text-text-primary'
                        : 'text-text-secondary hover:bg-bg-hover',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-text-tertiary" />
                    <span className="flex-1">{cmd.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-border-default text-[10px] text-text-muted">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> select</span>
          <span><kbd className="font-mono">esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
