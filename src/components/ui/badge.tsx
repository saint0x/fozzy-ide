import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

const variants = {
  default: "bg-bg-hover text-text-secondary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  error: "bg-error/10 text-error",
  info: "bg-accent-primary/10 text-accent-primary",
  outline: "border border-border-default text-text-secondary",
} as const;

const sizes = {
  sm: "text-[10px] px-1.5 py-0.5",
  md: "text-xs px-2 py-0.5",
} as const;

export interface BadgeProps {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}

export function Badge({
  variant = "default",
  size = "sm",
  dot,
  className,
  children,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md font-medium leading-none whitespace-nowrap",
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {dot && (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full bg-current animate-pulse-dot",
          )}
        />
      )}
      {children}
    </span>
  );
}
