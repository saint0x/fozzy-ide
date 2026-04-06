import { useState, useRef, useEffect, type ReactNode } from "react";
import { cn } from "../../lib/utils";

export interface DropdownProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
}

export function Dropdown({ trigger, children, align = "left", className }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  return (
    <div ref={ref} className={cn("relative inline-flex", className)}>
      <div onClick={() => setOpen((v) => !v)} className="cursor-default">
        {trigger}
      </div>
      {open && (
        <div
          className={cn(
            "absolute top-full mt-1 z-50 min-w-[160px]",
            "rounded-md border border-border-default bg-bg-elevated shadow-lg",
            "py-1 animate-slide-down",
            align === "left" ? "left-0" : "right-0",
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export interface DropdownItemProps {
  onClick?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  children: ReactNode;
  className?: string;
}

export function DropdownItem({
  onClick,
  disabled,
  destructive,
  children,
  className,
}: DropdownItemProps) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-1.5 text-xs text-left",
        "transition-colors duration-150",
        "disabled:opacity-50 disabled:pointer-events-none",
        destructive
          ? "text-error hover:bg-error/10"
          : "text-text-secondary hover:text-text-primary hover:bg-bg-hover",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function DropdownSeparator() {
  return <div className="my-1 h-px bg-border-default" />;
}
