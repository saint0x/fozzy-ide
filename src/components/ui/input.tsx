import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, icon, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-medium text-text-secondary"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              "h-8 w-full rounded-md border bg-bg-secondary px-3 text-sm text-text-primary",
              "placeholder:text-text-muted",
              "transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-primary focus-visible:border-accent-primary",
              error
                ? "border-error focus-visible:ring-error"
                : "border-border-default hover:border-border-emphasis",
              icon && "pl-8",
              className,
            )}
            {...props}
          />
        </div>
        {error && (
          <p className="text-xs text-error">{error}</p>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";
