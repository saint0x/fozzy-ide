import type { TelemetrySnapshot, TelemetrySeries } from '@/types';

function generateSnapshots(count: number): TelemetrySnapshot[] {
  const now = new Date('2026-04-06T10:00:00Z');
  const snapshots: TelemetrySnapshot[] = [];

  for (let i = count - 1; i >= 0; i--) {
    const ts = new Date(now.getTime() - i * 3600000); // hourly
    const noise = () => (Math.random() - 0.5) * 0.04;
    const basePassRate = 0.88 + noise();
    const totalRuns = Math.floor(40 + Math.random() * 30);

    snapshots.push({
      timestamp: ts.toISOString(),
      passRate: Math.min(1, Math.max(0, basePassRate)),
      failRate: Math.min(1, Math.max(0, 1 - basePassRate)),
      totalRuns,
      avgLatency: Math.floor(120 + Math.random() * 80),
      flakeSignals: Math.floor(Math.random() * 5),
      memoryUsageMb: Math.floor(180 + Math.random() * 120),
      exploreProgress: Math.min(100, 45 + i * 0.5 + Math.random() * 10),
      fuzzProgress: Math.min(100, 62 + i * 0.3 + Math.random() * 8),
    });
  }

  return snapshots;
}

export const mockTelemetrySnapshots: TelemetrySnapshot[] = generateSnapshots(24);

export const mockCurrentSnapshot: TelemetrySnapshot = {
  timestamp: '2026-04-06T09:45:00Z',
  passRate: 0.891,
  failRate: 0.109,
  totalRuns: 236,
  avgLatency: 142,
  flakeSignals: 3,
  memoryUsageMb: 247,
  exploreProgress: 78.3,
  fuzzProgress: 84.1,
};

function generateSeries(
  label: string,
  color: string,
  baseValue: number,
  variance: number,
): TelemetrySeries {
  const now = new Date('2026-04-06T10:00:00Z');
  const data: { timestamp: string; value: number }[] = [];

  for (let i = 23; i >= 0; i--) {
    const ts = new Date(now.getTime() - i * 3600000);
    data.push({
      timestamp: ts.toISOString(),
      value: Math.max(0, baseValue + (Math.random() - 0.5) * variance),
    });
  }

  return { label, data, color };
}

export const mockTelemetrySeries: Record<string, TelemetrySeries[]> = {
  passRate: [
    generateSeries('Pass Rate', '#22c55e', 0.89, 0.08),
    generateSeries('Fail Rate', '#ef4444', 0.11, 0.08),
  ],
  latency: [
    generateSeries('Avg Latency (ms)', '#3b82f6', 142, 60),
    generateSeries('P99 Latency (ms)', '#f59e0b', 380, 120),
  ],
  memory: [
    generateSeries('Memory (MB)', '#8b5cf6', 240, 100),
  ],
  throughput: [
    generateSeries('Runs / Hour', '#06b6d4', 52, 20),
  ],
};
