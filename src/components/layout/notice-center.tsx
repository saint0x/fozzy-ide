import { useEffect } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/app-store';

const toneStyles = {
  info: {
    icon: Info,
    className: 'border-accent-primary/30 bg-accent-primary/10 text-accent-primary',
  },
  success: {
    icon: CheckCircle2,
    className: 'border-success/30 bg-success/10 text-success',
  },
  warning: {
    icon: AlertTriangle,
    className: 'border-warning/30 bg-warning/10 text-warning',
  },
  error: {
    icon: AlertCircle,
    className: 'border-error/30 bg-error/10 text-error',
  },
} as const;

export function NoticeCenter() {
  const notices = useAppStore((state) => state.notices);
  const dismissNotice = useAppStore((state) => state.dismissNotice);

  useEffect(() => {
    if (notices.length === 0) return;
    const timers = notices.map((notice) =>
      window.setTimeout(() => dismissNotice(notice.id), notice.tone === 'error' ? 7000 : 4500),
    );
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [dismissNotice, notices]);

  if (notices.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {notices.map((notice) => {
        const style = toneStyles[notice.tone];
        const Icon = style.icon;
        return (
          <div
            key={notice.id}
            className={cn(
              'pointer-events-auto rounded-lg border bg-bg-elevated/95 px-3 py-2 shadow-lg backdrop-blur-sm',
              style.className,
            )}
          >
            <div className="flex items-start gap-2">
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-text-primary">{notice.title}</div>
                {notice.message ? (
                  <div className="mt-0.5 text-xs text-text-secondary">{notice.message}</div>
                ) : null}
              </div>
              <button
                onClick={() => dismissNotice(notice.id)}
                className="rounded p-0.5 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-secondary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
