import { cn } from "../../lib/utils";

const statusColors = {
  passing: "bg-success",
  passed: "bg-success",
  healthy: "bg-success",
  complete: "bg-success",
  failing: "bg-error",
  failed: "bg-error",
  error: "bg-error",
  flaky: "bg-warning",
  warning: "bg-warning",
  running: "bg-accent-primary",
  scanning: "bg-accent-primary",
  initializing: "bg-accent-primary",
  idle: "bg-text-muted",
  unknown: "bg-text-muted",
} as const;

export interface StatusDotProps {
  status: string;
  pulse?: boolean;
  className?: string;
}

export function StatusDot({ status, pulse, className }: StatusDotProps) {
  const color = statusColors[status as keyof typeof statusColors] ?? "bg-text-muted";

  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full shrink-0",
        color,
        pulse && "animate-pulse-dot",
        className,
      )}
    />
  );
}
