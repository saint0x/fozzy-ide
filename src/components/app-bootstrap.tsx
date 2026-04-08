import { startTransition, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { appDataProvider, mapWorkspaceSummary } from '@/data/provider';
import { Spinner } from '@/components/ui/spinner';
import { useAppStore } from '@/stores/app-store';
import { logFrontendEvent } from '@/lib/frontend-diagnostics';

export function AppBootstrap({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const startedRef = useRef(false);
  const startupState = useAppStore((state) => state.startupState);
  const startupError = useAppStore((state) => state.startupError);
  const setStartupState = useAppStore((state) => state.setStartupState);
  const setStartupError = useAppStore((state) => state.setStartupError);
  const setBootstrapPaths = useAppStore((state) => state.setBootstrapPaths);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const setActiveWorkspaceId = useAppStore((state) => state.setActiveWorkspaceId);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let disposed = false;

    const bootstrap = async () => {
      await logFrontendEvent('info', 'frontend.bootstrap', 'bootstrap start');
      const payload = await appDataProvider.bootstrap.load();
      if (disposed) return;
      const mappedWorkspaces = payload.workspaces.map((workspace) => mapWorkspaceSummary(workspace));
      const resolvedActiveWorkspaceId = payload.activeWorkspaceId ?? mappedWorkspaces[0]?.id ?? '';

      startTransition(() => {
        setBootstrapPaths({ storageRoot: payload.storageRoot, dbPath: payload.dbPath });
        setActiveWorkspaceId(resolvedActiveWorkspaceId);
        queryClient.setQueryData(['bootstrapWorkspaces'], payload.workspaces);
        queryClient.setQueryData(['workspaces'], mappedWorkspaces);
        mappedWorkspaces.forEach((workspace) => {
          queryClient.setQueryData(['workspace', workspace.id], workspace);
        });
        queryClient.setQueryData(['settings'], payload.settings);
        setStartupError(null);
        setStartupState('ready');
      });

      await logFrontendEvent('info', 'frontend.bootstrap', 'bootstrap ready', {
        workspaceCount: payload.workspaces.length,
        activeWorkspaceId: resolvedActiveWorkspaceId,
      });

      if (resolvedActiveWorkspaceId) {
        const warmup = async () => {
          await Promise.allSettled([
            queryClient.prefetchQuery({
              queryKey: ['projects', resolvedActiveWorkspaceId],
              queryFn: () => appDataProvider.projects.list(resolvedActiveWorkspaceId),
            }),
            queryClient.prefetchQuery({
              queryKey: ['runs', resolvedActiveWorkspaceId, { limit: 20 }],
              queryFn: () => appDataProvider.runs.list({ limit: 20 }),
            }),
            queryClient.prefetchQuery({
              queryKey: ['activity', resolvedActiveWorkspaceId, 10],
              queryFn: () => appDataProvider.activity.getRecent(10),
            }),
          ]);
        };
        window.setTimeout(() => {
          void warmup();
        }, 50);
      }
    };

    void bootstrap().catch(async (error: unknown) => {
      if (disposed) return;
      const message = error instanceof Error ? error.message : String(error);
      setStartupError(message);
      setStartupState('error');
      await logFrontendEvent('error', 'frontend.bootstrap', 'bootstrap failed', { message });
    });

    return () => {
      disposed = true;
    };
  }, [queryClient, setActiveWorkspaceId, setBootstrapPaths, setStartupError, setStartupState]);

  useEffect(() => {
    if (startupState !== 'ready' || !activeWorkspaceId) return;
    void appDataProvider.bootstrap.setActiveWorkspace(activeWorkspaceId).catch((error) => {
      console.error('[fozzy] failed to persist active workspace', error);
    });
  }, [activeWorkspaceId, startupState]);

  if (startupState === 'error') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bg-primary text-text-primary">
        <div className="max-w-md text-center">
          <p className="text-sm font-medium">Fozzy failed to start</p>
          <p className="mt-2 text-xs text-text-tertiary">{startupError ?? 'Unknown startup error'}</p>
        </div>
      </div>
    );
  }

  if (startupState !== 'ready') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bg-primary text-text-primary">
        <Spinner size="lg" />
      </div>
    );
  }

  return <>{children}</>;
}
