function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractMessage(value: unknown, seen = new Set<unknown>()): string | null {
  if (value == null) return null;
  if (seen.has(value)) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Error) {
    return extractMessage(value.message, seen) ?? value.name;
  }
  if (Array.isArray(value)) {
    seen.add(value);
    for (const item of value) {
      const message = extractMessage(item, seen);
      if (message) return message;
    }
    return null;
  }
  if (isRecord(value)) {
    seen.add(value);
    for (const key of ['message', 'error', 'reason', 'details', 'cause']) {
      if (key in value) {
        const message = extractMessage(value[key], seen);
        if (message) return message;
      }
    }
    try {
      const json = JSON.stringify(value);
      return json === '{}' ? null : json;
    } catch {
      return null;
    }
  }
  return null;
}

export function formatError(error: unknown, fallback = 'Unexpected error'): string {
  return extractMessage(error) ?? fallback;
}

export function normalizeError(error: unknown, fallback?: string): Error {
  if (error instanceof Error && error.message.trim()) return error;
  return new Error(formatError(error, fallback));
}
