import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/stores/app-store';
import { useSettings, useUpdateSettings } from '@/hooks/use-data';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import type { Settings } from '@/types';

export default function SettingsPage() {
  const setActiveSection = useAppStore((s) => s.setActiveSection);

  useEffect(() => {
    setActiveSection('settings');
  }, [setActiveSection]);

  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const [saved, setSaved] = useState(false);

  const handleUpdate = useCallback(
    (partial: Partial<Settings>) => {
      updateSettings.mutate(partial, {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 1500);
        },
      });
    },
    [updateSettings],
  );

  if (isLoading || !settings) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" className="text-text-muted" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-5 overflow-y-auto h-full max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text-primary">Settings</h1>
        <div
          className={cn(
            'text-xs font-medium text-success transition-opacity duration-300',
            saved ? 'opacity-100' : 'opacity-0',
          )}
        >
          Saved
        </div>
      </div>

      {/* Appearance */}
      <SettingsSection title="Appearance">
        <SettingsRow label="Theme" description="Color scheme for the interface">
          <div className="flex items-center gap-1 rounded-md border border-border-default bg-bg-primary p-0.5">
            {(['dark', 'light', 'system'] as const).map((t) => (
              <button
                key={t}
                onClick={() => handleUpdate({ theme: t })}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded capitalize transition-colors duration-100',
                  settings.theme === t
                    ? 'bg-bg-active text-text-primary'
                    : 'text-text-tertiary hover:text-text-secondary',
                  t !== 'dark' && 'opacity-50 cursor-not-allowed',
                )}
                disabled={t !== 'dark'}
              >
                {t}
              </button>
            ))}
          </div>
        </SettingsRow>

        <SettingsRow label="Font Size" description="Editor font size in pixels">
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleUpdate({ fontSize: Math.max(10, settings.fontSize - 1) })}
            >
              -
            </Button>
            <span className="w-8 text-center text-sm font-mono text-text-primary tabular-nums">
              {settings.fontSize}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleUpdate({ fontSize: Math.min(24, settings.fontSize + 1) })}
            >
              +
            </Button>
          </div>
        </SettingsRow>

        <SettingsRow label="Tab Size" description="Number of spaces per tab">
          <select
            value={settings.tabSize}
            onChange={(e) => handleUpdate({ tabSize: Number(e.target.value) })}
            className="h-8 rounded-md border border-border-default bg-bg-secondary px-2.5 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
          >
            <option value={2}>2</option>
            <option value={4}>4</option>
            <option value={8}>8</option>
          </select>
        </SettingsRow>
      </SettingsSection>

      {/* Editor */}
      <SettingsSection title="Editor">
        <SettingsRow label="Auto-save" description="Automatically save files after changes">
          <Toggle
            checked={settings.autoSave}
            onChange={(v) => handleUpdate({ autoSave: v })}
          />
        </SettingsRow>

        <SettingsRow label="Default Runner" description="Command used to run tests">
          <Input
            value={settings.defaultRunner}
            onChange={(e) => handleUpdate({ defaultRunner: e.target.value })}
            className="w-48"
          />
        </SettingsRow>
      </SettingsSection>

      {/* Telemetry */}
      <SettingsSection title="Telemetry">
        <SettingsRow label="Enable Telemetry" description="Collect usage and performance data">
          <Toggle
            checked={settings.telemetryEnabled}
            onChange={(v) => handleUpdate({ telemetryEnabled: v })}
          />
        </SettingsRow>

        <SettingsRow label="Checkpoint Interval" description="Seconds between automatic checkpoints">
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              min={1}
              max={300}
              value={settings.checkpointInterval}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 1) {
                  handleUpdate({ checkpointInterval: val });
                }
              }}
              className="w-20 text-center"
            />
            <span className="text-xs text-text-muted">sec</span>
          </div>
        </SettingsRow>
      </SettingsSection>

      {/* About */}
      <SettingsSection title="About">
        <SettingsRow label="Version" description="Current Fozzy build">
          <span className="text-sm font-mono text-text-secondary">0.1.0</span>
        </SettingsRow>

        <SettingsRow label="Build" description="Build metadata">
          <span className="text-xs font-mono text-text-muted">
            dev-2026.04.06+tauri
          </span>
        </SettingsRow>

        <SettingsRow label="Links" description="">
          <div className="flex items-center gap-3">
            <span className="text-xs text-accent-primary hover:underline cursor-default">
              Documentation
            </span>
            <span className="text-xs text-accent-primary hover:underline cursor-default">
              GitHub
            </span>
            <span className="text-xs text-accent-primary hover:underline cursor-default">
              Changelog
            </span>
          </div>
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-0">
      <div className="px-3 py-2 border-b border-border-default">
        <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          {title}
        </h2>
      </div>
      <div className="divide-y divide-border-muted">{children}</div>
    </Card>
  );
}

function SettingsRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-3 gap-4">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm text-text-primary font-medium">{label}</span>
        {description && (
          <span className="text-xs text-text-muted">{description}</span>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-primary',
        checked ? 'bg-accent-primary' : 'bg-bg-tertiary',
      )}
    >
      <span
        className={cn(
          'inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform duration-200',
          checked ? 'translate-x-[18px]' : 'translate-x-[3px]',
        )}
      />
    </button>
  );
}
