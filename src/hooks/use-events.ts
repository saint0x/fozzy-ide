import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { RunEventEnvelope } from '@/types/backend-contracts';
import { useAppStore } from '@/stores/app-store';

export interface WorkflowProgress {
  workflowId: string;
  steps: WorkflowStep[];
  isRunning: boolean;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface WorkflowStep {
  kind: string;
  label: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  timestamp: string;
  payload: Record<string, unknown>;
}

const WORKFLOW_STEPS = [
  { kind: 'workflowStarted', label: 'Workflow Started' },
  { kind: 'generationApplied', label: 'Scenarios Generated' },
  { kind: 'runStarted', label: 'Running Tests' },
  { kind: 'runFinished', label: 'Tests Complete' },
  { kind: 'workflowFinished', label: 'Workflow Complete' },
];

export function useWorkflowEvents(): WorkflowProgress | null {
  const [progress, setProgress] = useState<WorkflowProgress | null>(null);
  const startupState = useAppStore((state) => state.startupState);

  useEffect(() => {
    if (startupState !== 'ready') return;
    const unlisten = listen<RunEventEnvelope>('fozzy://event', (event) => {
      const envelope = event.payload;

      if (envelope.family === 'workflow' || envelope.family === 'runLifecycle') {
        setProgress((prev) => {
          const workflowId = (envelope.payload.workflowId as string) ?? prev?.workflowId ?? envelope.requestId;
          const steps = prev?.steps ? [...prev.steps] : [];

          const stepDef = WORKFLOW_STEPS.find((s) => s.kind === envelope.kind);
          if (stepDef) {
            const existing = steps.findIndex((s) => s.kind === envelope.kind);
            const step: WorkflowStep = {
              kind: envelope.kind,
              label: stepDef.label,
              status: envelope.kind.includes('Finished') || envelope.kind.includes('Applied') ? 'complete' : 'running',
              timestamp: envelope.at,
              payload: envelope.payload,
            };
            if (existing >= 0) {
              steps[existing] = step;
            } else {
              steps.push(step);
            }
          }

          const isRunning = envelope.kind !== 'workflowFinished';

          return {
            workflowId,
            steps,
            isRunning,
            startedAt: prev?.startedAt ?? (envelope.kind === 'workflowStarted' ? envelope.at : null),
            finishedAt: envelope.kind === 'workflowFinished' ? envelope.at : null,
          };
        });
      }
    });

    return () => { unlisten.then((fn) => fn()); };
  }, [startupState]);

  return progress;
}

export function useRunEvents() {
  const [events, setEvents] = useState<RunEventEnvelope[]>([]);
  const startupState = useAppStore((state) => state.startupState);

  useEffect(() => {
    if (startupState !== 'ready') return;
    const unlisten = listen<RunEventEnvelope>('fozzy://event', (event) => {
      setEvents((prev) => [event.payload, ...prev].slice(0, 100));
    });

    return () => { unlisten.then((fn) => fn()); };
  }, [startupState]);

  return events;
}
