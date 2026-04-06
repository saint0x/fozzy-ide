import { createContext, useContext, type ReactNode } from "react";
import { cn } from "../../lib/utils";

interface TabsContextValue {
  activeTab: string;
  onTabChange: (value: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("Tab components must be used within Tabs");
  return ctx;
}

export interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}

export function Tabs({ value, onValueChange, children, className }: TabsProps) {
  return (
    <TabsContext.Provider value={{ activeTab: value, onTabChange: onValueChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export interface TabListProps {
  children: ReactNode;
  className?: string;
}

export function TabList({ children, className }: TabListProps) {
  return (
    <div
      role="tablist"
      className={cn(
        "flex items-center gap-0 border-b border-border-default",
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface TabProps {
  value: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}

export function Tab({ value, children, className, disabled }: TabProps) {
  const { activeTab, onTabChange } = useTabsContext();
  const isActive = activeTab === value;

  return (
    <button
      role="tab"
      aria-selected={isActive}
      disabled={disabled}
      onClick={() => onTabChange(value)}
      className={cn(
        "relative px-3 py-2 text-xs font-medium transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-primary",
        "disabled:opacity-50 disabled:pointer-events-none",
        isActive
          ? "text-text-primary"
          : "text-text-tertiary hover:text-text-secondary",
        className,
      )}
    >
      {children}
      {isActive && (
        <span className="absolute bottom-0 left-0 right-0 h-px bg-accent-primary" />
      )}
    </button>
  );
}

export interface TabPanelProps {
  value: string;
  children: ReactNode;
  className?: string;
}

export function TabPanel({ value, children, className }: TabPanelProps) {
  const { activeTab } = useTabsContext();
  if (activeTab !== value) return null;

  return (
    <div role="tabpanel" className={cn("animate-fade-in", className)}>
      {children}
    </div>
  );
}
