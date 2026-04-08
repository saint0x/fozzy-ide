import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  FolderKanban,
  TestTubes,
  Play,
  GitBranch,
  Activity,
  TrendingUp,
  Code,
  Archive,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/app-store';
import { WorkspaceSwitcher } from './workspace-switcher';

const editorNav = [
  { to: '/editor', label: 'Editor', icon: Code, section: 'editor' as const },
];

const mainNav = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, section: 'overview' as const },
  { to: '/projects', label: 'Projects', icon: FolderKanban, section: 'projects' as const },
  { to: '/tests', label: 'Tests', icon: TestTubes, section: 'tests' as const },
  { to: '/runs', label: 'Runs', icon: Play, section: 'runs' as const },
  { to: '/traces', label: 'Traces', icon: GitBranch, section: 'traces' as const },
  { to: '/telemetry', label: 'Telemetry', icon: Activity, section: 'telemetry' as const },
  { to: '/trends', label: 'Trends', icon: TrendingUp, section: 'trends' as const },
];

const utilityNav = [
  { to: '/artifacts', label: 'Artifacts', icon: Archive, section: 'artifacts' as const },
  { to: '/settings', label: 'Settings', icon: Settings, section: 'settings' as const },
];

export function SidebarNav() {
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const setActiveSection = useAppStore((s) => s.setActiveSection);

  return (
    <nav
      className={cn(
        'flex flex-col h-full bg-bg-secondary border-r border-border-default transition-all duration-200 ease-out',
        collapsed ? 'w-[var(--sidebar-collapsed-width)]' : 'w-[var(--sidebar-width)]',
      )}
    >
      {/* Brand */}
      <div
        className={cn(
          'flex items-center h-[var(--topbar-height)] border-b border-border-default shrink-0',
          collapsed ? 'justify-center px-0' : 'px-3 gap-2',
        )}
      >
        <Zap className="h-4 w-4 text-accent-primary shrink-0" />
        {!collapsed && (
          <span className="text-sm font-bold text-text-primary tracking-tight">
            Fozzy
          </span>
        )}
      </div>

      {/* Workspace Switcher */}
      {!collapsed && (
        <div className="px-2 py-2 border-b border-border-default shrink-0">
          <WorkspaceSwitcher />
        </div>
      )}

      {/* Editor — primary action */}
      <div className="px-1.5 pt-2 pb-0 shrink-0">
        {editorNav.map((item) => (
          <NavItem
            key={item.to}
            {...item}
            collapsed={collapsed}
            onNavigate={() => setActiveSection(item.section)}
          />
        ))}
        <div className="mt-2 h-px bg-border-default mx-1" />
      </div>

      {/* Main navigation */}
      <div className="flex-1 overflow-y-auto py-2 px-1.5 space-y-0.5">
        {mainNav.map((item) => (
          <NavItem
            key={item.to}
            {...item}
            collapsed={collapsed}
            onNavigate={() => setActiveSection(item.section)}
          />
        ))}

        <div className="my-2 h-px bg-border-default mx-1" />

        {utilityNav.map((item) => (
          <NavItem
            key={item.to}
            {...item}
            collapsed={collapsed}
            onNavigate={() => setActiveSection(item.section)}
          />
        ))}
      </div>

      {/* Collapse toggle */}
      <div className="shrink-0 border-t border-border-default p-1.5">
        <button
          onClick={toggleSidebar}
          className={cn(
            'flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-xs text-text-tertiary',
            'hover:text-text-secondary hover:bg-bg-hover transition-colors duration-150',
            collapsed && 'justify-center',
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4 shrink-0" />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4 shrink-0" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </nav>
  );
}

function NavItem({
  to,
  label,
  icon: Icon,
  collapsed,
  onNavigate,
}: {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  return (
    <div className={cn(collapsed && 'relative group/navtip')}>
      <NavLink
        to={to}
        end={to === '/'}
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-colors duration-150',
            collapsed && 'justify-center',
            isActive
              ? 'bg-bg-hover text-text-primary border-l-2 border-accent-primary pl-1.5'
              : 'text-text-tertiary hover:text-text-secondary hover:bg-bg-hover border-l-2 border-transparent pl-1.5',
          )
        }
      >
        <Icon className="h-4 w-4 shrink-0" />
        {!collapsed && <span>{label}</span>}
      </NavLink>
      {collapsed && (
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 pointer-events-none opacity-0 group-hover/navtip:opacity-100 transition-opacity duration-150 delay-300">
          <div className="whitespace-nowrap rounded-md bg-bg-elevated border border-border-default px-2 py-1 text-xs text-text-secondary shadow-lg">
            {label}
          </div>
        </div>
      )}
    </div>
  );
}
