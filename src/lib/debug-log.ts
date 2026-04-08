import { formatError } from './errors';

export async function timed<T>(label: string, run: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    const result = await run();
    console.info(`[fozzy] ${label} completed in ${Math.round(performance.now() - start)}ms`);
    return result;
  } catch (error) {
    console.error(
      `[fozzy] ${label} failed in ${Math.round(performance.now() - start)}ms`,
      formatError(error),
      error,
    );
    throw error;
  }
}

export function logInfo(message: string, details?: unknown) {
  if (details === undefined) {
    console.info(`[fozzy] ${message}`);
    return;
  }
  console.info(`[fozzy] ${message}`, details);
}
