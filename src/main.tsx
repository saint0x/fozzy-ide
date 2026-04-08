import { createRoot } from 'react-dom/client';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { AppBootstrap } from '@/components/app-bootstrap';
import { AppShell } from '@/components/layout/app-shell';
import { installFrontendDiagnostics } from '@/lib/frontend-diagnostics';
import { queryClient } from '@/lib/query-client';
import OverviewPage from '@/pages/overview';
import ProjectsPage from '@/pages/projects';
import TestsPage from '@/pages/tests';
import RunsPage from '@/pages/runs';
import RunDetailPage from '@/pages/run-detail';
import TracesPage from '@/pages/traces';
import TraceDetailPage from '@/pages/trace-detail';
import TelemetryPage from '@/pages/telemetry';
import TrendsPage from '@/pages/trends';
import EditorPage from '@/pages/editor';
import ArtifactsPage from '@/pages/artifacts';
import SettingsPage from '@/pages/settings';
import './index.css';

installFrontendDiagnostics();

// ── Render ─────────────────────────────────────────────────────────────────────

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <AppBootstrap>
      <HashRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<OverviewPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="tests" element={<TestsPage />} />
            <Route path="runs" element={<RunsPage />} />
            <Route path="runs/:id" element={<RunDetailPage />} />
            <Route path="traces" element={<TracesPage />} />
            <Route path="traces/:id" element={<TraceDetailPage />} />
            <Route path="telemetry" element={<TelemetryPage />} />
            <Route path="trends" element={<TrendsPage />} />
            <Route path="editor" element={<EditorPage />} />
            <Route path="artifacts" element={<ArtifactsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </AppBootstrap>
  </QueryClientProvider>,
);
