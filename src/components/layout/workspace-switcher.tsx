import { Star, Plus, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/app-store';
import { useWorkspaces, useWorkspace } from '@/hooks/use-data';
import { Dropdown, DropdownItem, DropdownSeparator, StatusDot } from '@/components/ui';

export function WorkspaceSwitcher() {
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const setActiveWorkspaceId = useAppStore((s) => s.setActiveWorkspaceId);
  const { data: workspaces } = useWorkspaces();
  const { data: currentWorkspace } = useWorkspace(activeWorkspaceId);

  const trigger = (
    <div
      className={cn(
        'flex items-center gap-2 w-full rounded-md px-2 py-1.5',
        'hover:bg-bg-hover transition-colors duration-150 cursor-default',
      )}
    >
      {currentWorkspace && (
        <StatusDot status={currentWorkspace.status} pulse={currentWorkspace.status === 'initializing'} />
      )}
      <div className="flex-1 min-w-0">
        {currentWorkspace ? (
          <>
            <div className="text-xs font-medium text-text-primary truncate">
              {currentWorkspace.name}
            </div>
            <div className="text-[10px] text-text-muted truncate">
              {currentWorkspace.parentPath}
            </div>
          </>
        ) : (
          <div className="text-xs text-text-muted">No workspace</div>
        )}
      </div>
      <ChevronDown className="h-3 w-3 text-text-muted shrink-0" />
    </div>
  );

  return (
    <Dropdown trigger={trigger} className="w-full">
      <div className="px-2 py-1.5">
        <div className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
          Workspaces
        </div>
      </div>

      {workspaces?.map((ws) => (
        <DropdownItem
          key={ws.id}
          onClick={() => setActiveWorkspaceId(ws.id)}
        >
          <div className="flex items-center gap-2 w-full min-w-0">
            <StatusDot status={ws.status} />
            <div className="flex-1 min-w-0">
              <div
                className={cn(
                  'text-xs truncate',
                  ws.id === activeWorkspaceId ? 'text-text-primary font-medium' : 'text-text-secondary',
                )}
              >
                {ws.name}
              </div>
              <div className="text-[10px] text-text-muted truncate">{ws.parentPath}</div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                // toggle star - would call mutation
              }}
              className="p-0.5 text-text-muted hover:text-warning transition-colors"
            >
              <Star
                className={cn(
                  'h-3 w-3',
                  ws.starred && 'fill-warning text-warning',
                )}
              />
            </button>
          </div>
        </DropdownItem>
      ))}

      <DropdownSeparator />

      <DropdownItem>
        <Plus className="h-3 w-3" />
        <span>Import workspace</span>
      </DropdownItem>
    </Dropdown>
  );
}
