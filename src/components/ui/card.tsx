import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export interface CardProps {
  header?: ReactNode;
  children: ReactNode;
  hoverable?: boolean;
  className?: string;
  padding?: boolean;
  onClick?: () => void;
}

export function Card({
  header,
  children,
  hoverable,
  className,
  padding = true,
  onClick,
}: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-lg border border-border-default bg-bg-secondary",
        "transition-colors duration-150",
        hoverable && "hover:border-border-emphasis hover:bg-bg-tertiary cursor-default",
        onClick && "cursor-default",
        className,
      )}
    >
      {header && (
        <div className="flex items-center px-3 py-2 border-b border-border-default">
          {header}
        </div>
      )}
      {padding ? <div className="p-3">{children}</div> : children}
    </div>
  );
}
