import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Spinner } from "./spinner";

const variants = {
  default:
    "bg-bg-elevated text-text-primary border border-border-default hover:bg-bg-hover hover:border-border-emphasis",
  primary:
    "bg-accent-primary text-white hover:bg-accent-hover",
  ghost:
    "text-text-secondary hover:text-text-primary hover:bg-bg-hover",
  danger:
    "bg-error-muted/40 text-error border border-error-muted hover:bg-error-muted/60",
  outline:
    "border border-border-default text-text-secondary hover:text-text-primary hover:border-border-emphasis hover:bg-bg-hover",
} as const;

const sizes = {
  sm: "h-7 px-2.5 text-xs gap-1.5",
  md: "h-8 px-3 text-sm gap-2",
  lg: "h-9 px-4 text-sm gap-2",
  icon: "h-8 w-8 p-0 justify-center",
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center rounded-md font-medium transition-colors duration-150",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-primary",
          "disabled:opacity-50 disabled:pointer-events-none",
          "cursor-pointer select-none",
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      >
        {loading && <Spinner size="sm" />}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
