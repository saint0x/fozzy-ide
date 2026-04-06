import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/app-shell';
import OverviewPage from '@/pages/overview';
import ProjectsPage from '@/pages/projects';
import TestsPage from '@/pages/tests';
import RunsPage from '@/pages/runs';
import RunDetailPage from '@/pages/run-detail';
import TracesPage from '@/pages/traces';
import TraceDetailPage from '@/pages/trace-detail';
import TelemetryPage from '@/pages/telemetry';
import EditorPage from '@/pages/editor';
import ArtifactsPage from '@/pages/artifacts';
import SettingsPage from '@/pages/settings';
import './index.css';

// ── Query client ───────────────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

// ── Render ─────────────────────────────────────────────────────────────────────

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
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
            <Route path="editor" element={<EditorPage />} />
            <Route path="artifacts" element={<ArtifactsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
