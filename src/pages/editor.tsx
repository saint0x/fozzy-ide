import { useEffect, useCallback, useState } from 'react';
import { useAppStore } from '@/stores/app-store';
import { useEditorStore } from '@/stores/editor-store';
import { useFileTree, useDiagnostics } from '@/hooks/use-data';
import { mockDataProvider } from '@/data/mocks';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FileTree } from '@/components/domain/file-tree';
import { cn } from '@/lib/utils';
import type { FileNode } from '@/types';

const ROOT_PATH = '/Users/deepsaint/projects/photon-engine';

export default function EditorPage() {
  const setActiveSection = useAppStore((s) => s.setActiveSection);
  const setDrawerTab = useAppStore((s) => s.setDrawerTab);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    setActiveSection('editor');
  }, [setActiveSection]);

  const { data: fileTree, isLoading: treeLoading } = useFileTree(ROOT_PATH);
  const { data: diagnostics } = useDiagnostics();
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const openFile = useEditorStore((s) => s.openFile);
  const closeTab = useEditorStore((s) => s.closeTab);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  const handleFileSelect = useCallback(
    async (node: FileNode) => {
      if (node.type === 'directory') return;
      // Check if already open
      const existing = tabs.find((t) => t.filePath === node.path);
      if (existing) {
        setActiveTab(existing.id);
        return;
      }
      const content = await mockDataProvider.fileSystem.readFile(node.path);
      openFile(node.path, node.name, node.language ?? 'text', content);
    },
    [tabs, openFile, setActiveTab],
  );

  const problemCount = diagnostics?.filter((d) => d.severity === 'error' || d.severity === 'warning').length ?? 0;

  const breadcrumbs = activeTab
    ? activeTab.filePath
        .replace(ROOT_PATH + '/', '')
        .split('/')
    : [];

  const isTestFile = activeTab
    ? /\.(test|spec)\.(ts|tsx|rs|py)$/.test(activeTab.fileName) ||
      activeTab.filePath.includes('/tests/')
    : false;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar: File Tree */}
      <div
        className={cn(
          'flex flex-col border-r border-border-default bg-bg-secondary transition-all duration-200 shrink-0',
          sidebarCollapsed ? 'w-0 overflow-hidden' : 'w-[220px]',
        )}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-border-default">
          <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            Explorer
          </span>
          <button
            onClick={() => setSidebarCollapsed(true)}
            className="text-text-muted hover:text-text-secondary transition-colors p-0.5"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
              <path d="M9.354 2.354a.5.5 0 00-.708-.708l-5 5a.5.5 0 000 .708l5 5a.5.5 0 00.708-.708L4.707 7.5H14.5a.5.5 0 000-1H4.707l4.647-4.646z" />
            </svg>
          </button>
        </div>

        {treeLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size="sm" className="text-text-muted" />
          </div>
        ) : fileTree ? (
          <FileTree
            root={fileTree}
            onFileSelect={handleFileSelect}
            selectedPath={activeTab?.filePath ?? null}
            className="flex-1 py-1"
          />
        ) : null}
      </div>

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Collapse toggle when sidebar hidden */}
        {sidebarCollapsed && (
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-bg-elevated border border-border-default rounded-r-md p-1 text-text-muted hover:text-text-secondary transition-colors"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
              <path d="M6.646 2.354a.5.5 0 01.708 0l5 5a.5.5 0 010 .708l-5 5a.5.5 0 01-.708-.708L11.293 8 6.646 3.354a.5.5 0 010-.708z" />
            </svg>
          </button>
        )}

        {/* Tab bar */}
        {tabs.length > 0 && (
          <div className="flex items-center border-b border-border-default bg-bg-secondary overflow-x-auto shrink-0">
            {tabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              return (
                <div
                  key={tab.id}
                  className={cn(
                    'group flex items-center gap-1.5 px-3 py-1.5 text-xs border-r border-border-muted cursor-default select-none shrink-0',
                    'transition-colors duration-100',
                    isActive
                      ? 'bg-bg-primary text-text-primary border-b-2 border-b-accent-primary'
                      : 'text-text-tertiary hover:text-text-secondary hover:bg-bg-hover',
                  )}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.dirty && (
                    <span className="h-1.5 w-1.5 rounded-full bg-accent-primary shrink-0" />
                  )}
                  <span className="truncate max-w-[120px]">{tab.fileName}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                    className="ml-1 opacity-0 group-hover:opacity-100 text-text-muted hover:text-text-secondary transition-opacity p-0.5 rounded"
                  >
                    <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Toolbar */}
        {activeTab && (
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-muted bg-bg-secondary/50 shrink-0">
            <div className="flex items-center gap-1 text-xs text-text-muted overflow-hidden">
              {breadcrumbs.map((seg, i) => (
                <span key={i} className="flex items-center gap-1 shrink-0">
                  {i > 0 && <span className="text-text-muted/40">/</span>}
                  <span
                    className={cn(
                      i === breadcrumbs.length - 1
                        ? 'text-text-secondary font-medium'
                        : 'text-text-muted',
                    )}
                  >
                    {seg}
                  </span>
                </span>
              ))}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isTestFile && (
                <Button variant="primary" size="sm">
                  <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M11.596 8.697l-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 010 1.393z" />
                  </svg>
                  Run
                </Button>
              )}
              {problemCount > 0 && (
                <button
                  onClick={() => setDrawerTab('problems')}
                  className="flex items-center gap-1"
                >
                  <Badge variant="error" size="sm">
                    {problemCount} problem{problemCount !== 1 ? 's' : ''}
                  </Badge>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Code area */}
        {activeTab ? (
          <div className="flex-1 overflow-auto bg-bg-primary">
            <div className="flex min-h-full">
              {/* Line numbers */}
              <div className="shrink-0 py-3 pr-3 text-right select-none border-r border-border-muted/30">
                {activeTab.content.split('\n').map((_, i) => (
                  <div
                    key={i}
                    className="px-3 text-[11px] leading-5 text-text-muted/50 font-mono"
                  >
                    {i + 1}
                  </div>
                ))}
              </div>

              {/* Code */}
              <pre className="flex-1 py-3 px-4 overflow-x-auto">
                <code className="text-[12px] leading-5 font-mono text-text-primary whitespace-pre">
                  {activeTab.content}
                </code>
              </pre>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-bg-primary">
            <EmptyState
              icon={
                <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" />
                  <polyline points="13 2 13 9 20 9" />
                </svg>
              }
              title="Open a file from the tree to start editing"
              description="Select a file from the explorer sidebar to view its contents."
            />
          </div>
        )}
      </div>
    </div>
  );
}
