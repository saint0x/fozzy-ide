import { Plus, ChevronDown } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { selectProjectFolder } from '@/lib/project-import';
import { useAppStore } from '@/stores/app-store';
import { useActiveWorkspace, useImportWorkspace, useWorkspaces } from '@/hooks/use-data';
import { appDataProvider } from '@/data/provider';
import { Dropdown, DropdownItem, DropdownSeparator, StatusDot } from '@/components/ui';
import type { Workspace } from '@/types';

const MAX_VISIBLE_WORKSPACES = 5;

export function WorkspaceSwitcher() {
  const queryClient = useQueryClient();
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const setActiveWorkspaceId = useAppStore((s) => s.setActiveWorkspaceId);
  const pushNotice = useAppStore((s) => s.pushNotice);
  const { data: workspaces } = useWorkspaces();
  const currentWorkspace = useActiveWorkspace();
  const importWorkspace = useImportWorkspace();
  const orderedWorkspaces = [...(workspaces ?? [])].sort((left, right) =>
    right.lastOpened.localeCompare(left.lastOpened),
  );

  async function handleImportWorkspace() {
    const path = await selectProjectFolder();
    if (!path) return;
    importWorkspace.mutate(path);
  }

  async function handleSelectWorkspace(workspaceId: string) {
    if (workspaceId === activeWorkspaceId) return;
    setActiveWorkspaceId(workspaceId);
    const workspace = orderedWorkspaces.find((item) => item.id === workspaceId);
    if (workspace) {
      queryClient.setQueryData<Workspace[]>(['workspaces'], (current = []) => [
        workspace,
        ...current.filter((item) => item.id !== workspace.id),
      ]);
      queryClient.setQueryData(['workspace', workspace.id], {
        ...workspace,
        lastOpened: new Date().toISOString(),
      });
    }
    pushNotice({
      tone: 'success',
      title: workspace ? `Workspace active: ${workspace.name}` : 'Workspace switched',
      message: 'Shell state is refreshing for the selected workspace.',
    });
    void appDataProvider.bootstrap.setActiveWorkspace(workspaceId).catch((error) => {
      console.error('[fozzy] failed to persist workspace switch', error);
    });
    void Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: ['projects', workspaceId] }),
      queryClient.invalidateQueries({ queryKey: ['scenarios', workspaceId] }),
      queryClient.invalidateQueries({ queryKey: ['runs', workspaceId] }),
      queryClient.invalidateQueries({ queryKey: ['activity', workspaceId] }),
      queryClient.invalidateQueries({ queryKey: ['telemetry', workspaceId] }),
      queryClient.prefetchQuery({
        queryKey: ['workspace', workspaceId],
        queryFn: () => appDataProvider.workspaces.get(workspaceId),
      }),
      queryClient.prefetchQuery({
        queryKey: ['fileTree', workspace?.path ?? workspaceId],
        queryFn: () => appDataProvider.fileSystem.getTree(workspace?.path ?? ''),
      }),
    ]);
  }

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

      <div className="max-h-[240px] overflow-y-auto">
        {orderedWorkspaces.map((ws, index) => (
          <DropdownItem
            key={ws.id}
            onClick={() => void handleSelectWorkspace(ws.id)}
            className={cn(index >= MAX_VISIBLE_WORKSPACES && 'opacity-95')}
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
            </div>
          </DropdownItem>
        ))}
      </div>

      <DropdownSeparator />

      <DropdownItem onClick={() => void handleImportWorkspace()}>
        <Plus className="h-3 w-3" />
        <span>Add workspace</span>
      </DropdownItem>
    </Dropdown>
  );
}
