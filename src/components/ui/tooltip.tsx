import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export interface TooltipProps {
  content: string;
  side?: "top" | "bottom";
  children: ReactNode;
  className?: string;
}

export function Tooltip({ content, side = "top", children, className }: TooltipProps) {
  return (
    <div className={cn("relative group/tooltip inline-flex", className)}>
      {children}
      <div
        className={cn(
          "absolute left-1/2 -translate-x-1/2 z-50",
          "pointer-events-none opacity-0 group-hover/tooltip:opacity-100",
          "transition-opacity duration-150 delay-300",
          side === "top" && "bottom-full mb-1.5",
          side === "bottom" && "top-full mt-1.5",
        )}
      >
        <div
          className={cn(
            "whitespace-nowrap rounded-md bg-bg-elevated border border-border-default",
            "px-2 py-1 text-xs text-text-secondary shadow-lg",
          )}
        >
          {content}
        </div>
      </div>
    </div>
  );
}
