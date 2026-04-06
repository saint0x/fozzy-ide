import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-12 px-4 text-center",
        className,
      )}
    >
      {icon && (
        <div className="text-text-muted">{icon}</div>
      )}
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-text-secondary">{title}</h3>
        {description && (
          <p className="text-xs text-text-tertiary max-w-[280px]">{description}</p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
