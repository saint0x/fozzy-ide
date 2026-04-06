import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'passing': case 'passed': case 'healthy': case 'complete': return 'text-success';
    case 'failing': case 'failed': case 'error': return 'text-error';
    case 'flaky': case 'warning': return 'text-warning';
    case 'running': case 'scanning': case 'initializing': return 'text-accent-primary';
    default: return 'text-text-secondary';
  }
}

export function getStatusBgColor(status: string): string {
  switch (status) {
    case 'passing': case 'passed': case 'healthy': case 'complete': return 'bg-success/10 text-success';
    case 'failing': case 'failed': case 'error': return 'bg-error/10 text-error';
    case 'flaky': case 'warning': return 'bg-warning/10 text-warning';
    case 'running': case 'scanning': case 'initializing': return 'bg-accent-primary/10 text-accent-primary';
    default: return 'bg-bg-hover text-text-secondary';
  }
}
