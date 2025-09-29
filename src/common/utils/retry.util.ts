function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withTimeout<T>(op: () => Promise<T>, timeoutMs: number, message = 'Timeout'): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | null = null;
  try {
    return await Promise.race<Promise<T>>([
      op(),
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(message)), Math.max(1, timeoutMs));
      }),
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

export async function withRetry<T>(
  op: () => Promise<T>,
  options?: { attempts?: number; backoffMs?: number; timeoutMs?: number }
): Promise<T> {
  const attempts = options?.attempts ?? 2;
  const backoffMs = options?.backoffMs ?? 200;
  const timeoutMs = options?.timeoutMs;
  let lastErr: unknown;
  for (let i = 0; i <= attempts; i++) {
    try {
      if (timeoutMs) {
        return await withTimeout(op, timeoutMs);
      }
      return await op();
    } catch (err) {
      lastErr = err;
      if (i === attempts) break;
      const jitter = Math.floor(Math.random() * 50);
      await delay(backoffMs * Math.pow(2, i) + jitter);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}


