import { invoke } from '@tauri-apps/api/core';
import { formatError } from '@/lib/errors';

let installed = false;

async function emit(level: string, scope: string, message: string, context?: unknown) {
  try {
    await invoke('log_frontend_diagnostic', {
      request: {
        level,
        scope,
        message,
        context: context ?? null,
      },
    });
  } catch (error) {
    console.error('[fozzy] failed to write frontend diagnostic', error);
  }
}

export function installFrontendDiagnostics() {
  if (installed) return;
  installed = true;

  window.addEventListener('error', (event) => {
    void emit('error', 'window.error', event.message, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    void emit('error', 'window.unhandledrejection', 'Unhandled promise rejection', {
      reason: formatError(event.reason),
    });
  });
}

export async function logFrontendEvent(
  level: 'info' | 'warn' | 'error',
  scope: string,
  message: string,
  context?: unknown,
) {
  await emit(level, scope, message, context);
}
