import type { Context } from "grammy";

type NextFunction = () => Promise<void>;

class Semaphore {
  private permits: number;
  private waitQueue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  get queueSize(): number {
    return this.waitQueue.length;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  release(): void {
    this.permits++;
    if (this.waitQueue.length > 0) {
      this.permits--;
      const next = this.waitQueue.shift();
      if (!next) {
        this.permits++;
        return;
      }
      next();
    }
  }
}

const MAX_CONCURRENT = 4;
const MAX_QUEUE = 20;

const semaphore = new Semaphore(MAX_CONCURRENT);

export function concurrencyMiddleware() {
  return async (_ctx: Context, next: NextFunction): Promise<void> => {
    if (semaphore.queueSize >= MAX_QUEUE) {
      console.error(`[CONCURRENCY] Dropping update, queue full (${MAX_QUEUE}+)`);
      return;
    }
    await semaphore.acquire();
    try {
      await next();
    } finally {
      semaphore.release();
    }
  };
}
