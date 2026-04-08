import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/stores/app-store';
import {
  useImportProject,
  useInitializeProject,
  useProjects,
  useRunAllScenarios,
  useScanProject,
} from '@/hooks/use-data';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { selectProjectFolder } from '@/lib/project-import';
import { cn, formatRelativeTime } from '@/lib/utils';
import type { Project } from '@/types';

// ── Language Badge Colors ────────────────────────────────────────────────────

const languageColors: Record<Project['language'], { bg: string; text: string }> = {
  rust: { bg: 'bg-orange-500/10', text: 'text-orange-400' },
  typescript: { bg: 'bg-blue-500/10', text: 'text-blue-400' },
  python: { bg: 'bg-yellow-500/10', text: 'text-yellow-400' },
  go: { bg: 'bg-cyan-500/10', text: 'text-cyan-400' },
  c: { bg: 'bg-gray-500/10', text: 'text-gray-400' },
  cpp: { bg: 'bg-purple-500/10', text: 'text-purple-400' },
};

function LanguageBadge({ language }: { language: Project['language'] }) {
  const colors = languageColors[language];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium',
        colors.bg,
        colors.text,
      )}
    >
      {language}
    </span>
  );
}

// ── Scan State Indicator ─────────────────────────────────────────────────────

function ScanIndicator({ state }: { state: Project['scanState'] }) {
  switch (state) {
    case 'pending':
      return <span className="text-xs text-text-tertiary">Pending</span>;
    case 'scanning':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-accent-primary">
          <Spinner size="sm" />
          Scanning
        </span>
      );
    case 'complete':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-success">
          &#10003; Scanned
        </span>
      );
    case 'error':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-error">
          &#10005; Error
        </span>
      );
  }
}

// ── Config Status ────────────────────────────────────────────────────────────

function ConfigIndicator({ status }: { status: Project['configStatus'] }) {
  switch (status) {
    case 'configured':
      return <Badge variant="success" size="sm">Configured</Badge>;
    case 'unconfigured':
      return <Badge variant="default" size="sm">Unconfigured</Badge>;
    case 'invalid':
      return <Badge variant="error" size="sm">Invalid</Badge>;
  }
}

// ── Project Card ─────────────────────────────────────────────────────────────

function ProjectCard({ project }: { project: Project }) {
  const navigate = useNavigate();
  const scanProject = useScanProject();
  const initializeProject = useInitializeProject();
  const runAllScenarios = useRunAllScenarios();

  return (
    <Card hoverable className="flex flex-col">
      <div className="space-y-3">
        {/* Name + Language */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-text-primary truncate">
              {project.name}
            </h3>
            <p className="text-xs text-text-tertiary truncate mt-0.5" title={project.path}>
              {project.path}
            </p>
          </div>
          <LanguageBadge language={project.language} />
        </div>

        {/* Status row */}
        <div className="flex items-center gap-3 flex-wrap">
          <ScanIndicator state={project.scanState} />
          <ConfigIndicator status={project.configStatus} />
        </div>

        {/* Metadata */}
        <div className="flex items-center gap-4 text-xs text-text-tertiary">
          <span>
            {project.scenarioCount} scenario{project.scenarioCount !== 1 ? 's' : ''}
          </span>
          {project.lastScanned && (
            <span>Scanned {formatRelativeTime(project.lastScanned)}</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1 border-t border-border-muted">
          {project.configStatus === 'unconfigured' && (
            <Button
              variant="primary"
              size="sm"
              loading={initializeProject.isPending}
              onClick={() => initializeProject.mutate(project.id)}
            >
              Initialize
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            loading={scanProject.isPending}
            onClick={() => scanProject.mutate(project.id)}
          >
            Scan
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate('/editor')}>
            Open
          </Button>
          {project.configStatus === 'configured' && project.scanState === 'complete' && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              loading={runAllScenarios.isPending}
              onClick={() => runAllScenarios.mutate(project.id)}
            >
              Run All
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const { activeWorkspaceId, setActiveSection } = useAppStore();
  const importProject = useImportProject();
  const scanProject = useScanProject();

  useEffect(() => {
    setActiveSection('projects');
  }, [setActiveSection]);

  const { data: projects, isLoading } = useProjects(activeWorkspaceId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }

  async function handleImportProject() {
    const path = await selectProjectFolder();
    if (!path) return;
    importProject.mutate(path);
  }

  function handleScanAll() {
    if (!projects) return;
    projects.forEach((project) => scanProject.mutate(project.id));
  }

  return (
    <div className="p-6 space-y-6 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text-primary">Projects</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="md" loading={scanProject.isPending} onClick={handleScanAll}>
            Scan All
          </Button>
          <Button variant="primary" size="md" disabled={!activeWorkspaceId} onClick={handleImportProject}>
            Import Project
          </Button>
        </div>
      </div>

      {/* Grid or Empty */}
      {!projects || projects.length === 0 ? (
        <EmptyState
          title="No projects found"
          description="Import a project to get started."
          action={
            <Button variant="primary" size="sm" disabled={!activeWorkspaceId} onClick={handleImportProject}>
              Import Project
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((project: Project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
