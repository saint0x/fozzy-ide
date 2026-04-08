import { useEffect, useCallback, useState } from 'react';
import { useAppStore } from '@/stores/app-store';
import { useEditorStore } from '@/stores/editor-store';
import {
  useActiveWorkspace,
  useDiagnostics,
  useDocumentBundle,
  useFileTree,
  useRunScenario,
} from '@/hooks/use-data';
import { appDataProvider } from '@/data/provider';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { CodeEditor } from '@/components/domain/code-editor';
import { FileTree } from '@/components/domain/file-tree';
import { formatError } from '@/lib/errors';
import { cn } from '@/lib/utils';
import type { FileNode } from '@/types';

function findPreferredFile(node: FileNode): FileNode | null {
  if (node.type === 'file') return node;
  const children = node.children ?? [];
  const priority = [
    'fozzy.toml',
    'Cargo.toml',
    'package.json',
    'README.md',
    'src/main.rs',
    'src/lib.rs',
    'src/main.ts',
    'src/index.ts',
  ];
  for (const preferred of priority) {
    const match = children.find((child) => child.path.endsWith(preferred));
    if (match) {
      return match.type === 'file' ? match : findPreferredFile(match);
    }
  }
  const scenarioDir = children.find((child) => child.type === 'directory' && /tests?|scenarios?|examples?/.test(child.name));
  if (scenarioDir) {
    const match = findPreferredFile(scenarioDir);
    if (match) return match;
  }
  for (const child of children) {
    const match = findPreferredFile(child);
    if (match) return match;
  }
  return null;
}

function treeContainsPath(node: FileNode, targetPath: string): boolean {
  if (node.path === targetPath) return true;
  if (node.type !== 'directory') return false;
  return (node.children ?? []).some((child) => treeContainsPath(child, targetPath));
}

export default function EditorPage() {
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const setActiveSection = useAppStore((s) => s.setActiveSection);
  const setDrawerTab = useAppStore((s) => s.setDrawerTab);
  const pushNotice = useAppStore((s) => s.pushNotice);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    setActiveSection('editor');
  }, [setActiveSection]);

  const workspace = useActiveWorkspace();
  const { data: fileTree, isLoading: treeLoading } = useFileTree(workspace?.path ?? '');
  const { data: diagnostics } = useDiagnostics();
  const runScenario = useRunScenario();
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const openFile = useEditorStore((s) => s.openFile);
  const closeTab = useEditorStore((s) => s.closeTab);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const updateContent = useEditorStore((s) => s.updateContent);
  const markSaved = useEditorStore((s) => s.markSaved);
  const [saving, setSaving] = useState(false);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const documentBundle = useDocumentBundle(activeTab?.filePath ?? '', !!activeTab);

  const handleFileSelect = useCallback(
    async (node: FileNode) => {
      if (node.type === 'directory') return;
      // Check if already open
      const existing = tabs.find((t) => t.filePath === node.path);
      if (existing) {
        setActiveTab(existing.id);
        return;
      }
      const content = await appDataProvider.fileSystem.readFile(node.path);
      openFile(node.path, node.name, node.language ?? 'text', content);
    },
    [tabs, openFile, setActiveTab],
  );

  const activeFileDiagnostics = (documentBundle.data?.diagnostics.diagnostics ?? [])
    .map((diagnostic, index) => ({
      id: `${diagnostic.path}:${diagnostic.line ?? 0}:${index}`,
      filePath: diagnostic.path,
      line: diagnostic.line ?? 1,
      column: diagnostic.column ?? 1,
      severity: diagnostic.severity as 'error' | 'warning' | 'info' | 'hint',
      message: diagnostic.message,
      source: diagnostic.source,
    }))
    .concat(
      (diagnostics ?? []).filter((diagnostic) => diagnostic.filePath === activeTab?.filePath),
    );

  const saveActiveTab = useCallback(async () => {
    if (!activeTab) return;
    setSaving(true);
    try {
      await appDataProvider.fileSystem.writeFile(activeTab.filePath, activeTab.content);
      markSaved(activeTab.id);
      pushNotice({
        tone: 'success',
        title: `Saved ${activeTab.fileName}`,
        message: 'The workspace file was written successfully.',
      });
    } catch (error) {
      pushNotice({
        tone: 'error',
        title: `Failed to save ${activeTab.fileName}`,
        message: formatError(error),
      });
      throw error;
    } finally {
      setSaving(false);
    }
  }, [activeTab, markSaved, pushNotice]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return;
      event.preventDefault();
      void saveActiveTab();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveActiveTab]);

  const problemCount = diagnostics?.filter((d) => d.severity === 'error' || d.severity === 'warning').length ?? 0;

  const breadcrumbs = activeTab
    ? activeTab.filePath
        .split('/')
    : [];

  const isTestFile = activeTab
    ? /\.(test|spec)\.(ts|tsx|rs|py)$/.test(activeTab.fileName) ||
      activeTab.filePath.includes('/tests/') ||
      activeTab.filePath.endsWith('.fozzy') ||
      activeTab.filePath.endsWith('.fozzy.json') ||
      activeTab.filePath.endsWith('.fzy')
    : false;

  const isRunnableScenario = activeTab
    ? activeTab.filePath.endsWith('.fozzy') ||
      activeTab.filePath.endsWith('.fozzy.json') ||
      activeTab.filePath.endsWith('.fzy')
    : false;

  useEffect(() => {
    if (!workspace || !fileTree) return;
    if (activeTab?.filePath && treeContainsPath(fileTree, activeTab.filePath)) return;
    const preferred = findPreferredFile(fileTree);
    if (!preferred || preferred.type !== 'file') return;
    void handleFileSelect(preferred);
  }, [activeTab?.filePath, fileTree, handleFileSelect, workspace]);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar: File Tree */}
      <div
        className={cn(
          'flex flex-col border-r border-border-default bg-bg-secondary transition-all duration-200 shrink-0',
          sidebarCollapsed ? 'w-0 overflow-hidden' : 'w-[260px]',
        )}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-border-default">
          <div className="min-w-0">
            <div className="text-xs font-medium text-text-secondary uppercase tracking-wider">
              Explorer
            </div>
            <div className="mt-1 truncate text-[11px] text-text-primary">
              {workspace?.name ?? 'No workspace selected'}
            </div>
          </div>
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
        ) : (
          <div className="px-3 py-4 text-xs text-text-muted">
            {workspace ? 'No readable files were discovered for this workspace yet.' : 'Select a workspace to load its files.'}
          </div>
        )}
      </div>

      {/* Main area */}
      <div className="flex min-w-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
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
              <Button
                variant="outline"
                size="sm"
                loading={saving}
                disabled={!activeTab?.dirty}
                onClick={() => void saveActiveTab()}
              >
                Save
              </Button>
              {isTestFile && (
                <Button
                  variant="primary"
                  size="sm"
                  loading={runScenario.isPending}
                  disabled={!isRunnableScenario || !activeWorkspaceId}
                  onClick={() => {
                    if (!activeTab || !activeWorkspaceId || !isRunnableScenario) return;
                    runScenario.mutate(`${activeWorkspaceId}::${activeTab.filePath}`);
                  }}
                >
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
          <div className="flex-1 min-h-0 overflow-hidden bg-bg-primary">
            <CodeEditor
              value={activeTab.content}
              language={activeTab.language}
              diagnostics={activeFileDiagnostics}
              bundle={documentBundle.data ?? null}
              onChange={(content) => updateContent(activeTab.id, content)}
            />
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
              description={
                workspace
                  ? 'The current workspace is ready. Pick any file from the explorer or let the editor open a preferred file automatically.'
                  : 'Import or select a workspace to start browsing files.'
              }
            />
          </div>
        )}
      </div>

        {activeTab && (
          <aside className="hidden w-[280px] shrink-0 border-l border-border-default bg-bg-secondary/70 xl:flex xl:flex-col">
            <div className="border-b border-border-default px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wider text-text-muted">
                File Insight
              </div>
              <div className="mt-1 text-sm text-text-primary truncate">{activeTab.fileName}</div>
              <div className="mt-1 text-[11px] text-text-tertiary">{activeTab.language}</div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <section className="border-b border-border-default px-4 py-3">
                <div className="text-xs font-medium text-text-secondary">Symbols</div>
                <div className="mt-2 space-y-1.5">
                  {(documentBundle.data?.symbols ?? []).length > 0 ? (
                    documentBundle.data?.symbols.map((symbol) => (
                      <button
                        key={`${symbol.name}:${symbol.line}`}
                        className="block w-full rounded-md px-2 py-1 text-left text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                      >
                        <span className="block truncate">{symbol.name}</span>
                        <span className="text-[10px] text-text-muted">Line {symbol.line}</span>
                      </button>
                    ))
                  ) : (
                    <div className="text-xs text-text-muted">No symbols discovered for this file.</div>
                  )}
                </div>
              </section>

              <section className="px-4 py-3">
                <div className="text-xs font-medium text-text-secondary">Diagnostics</div>
                <div className="mt-2 space-y-2">
                  {activeFileDiagnostics.length > 0 ? (
                    activeFileDiagnostics.map((diagnostic) => (
                      <div key={diagnostic.id} className="rounded-md border border-border-default bg-bg-primary/60 px-3 py-2">
                        <div className="text-xs text-text-primary">{diagnostic.message}</div>
                        <div className="mt-1 text-[10px] text-text-muted">
                          {diagnostic.severity.toUpperCase()} at {diagnostic.line}:{diagnostic.column}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-text-muted">No file diagnostics.</div>
                  )}
                </div>
              </section>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
