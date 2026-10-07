export type SleepFn = (ms: number) => Promise<void>;

const defaultSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** SQLSTATE transitorios que justifican reintentar la transacción completa. */
const TRANSIENT_CODES = new Set([
  '40001', // serialization_failure
  '40P01', // deadlock_detected
  '08000', // connection_exception
  '08003', // connection_does_not_exist
  '08006', // connection_failure
  '08007', // transaction_resolution_unknown
  '57P03', // cannot_connect_now
  '53300', // too_many_connections
]);

/**
 * Reintenta la transacción ante fallos transitorios de PostgreSQL con backoff
 * exponencial + jitter. Nunca se usa alrededor de llamadas al proveedor de pagos.
 */
export class RetryPolicy {
  constructor(
    private readonly maxAttempts = 3,
    private readonly baseDelayMs = 50,
    private readonly sleep: SleepFn = defaultSleep,
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    let attempt = 0;
    for (;;) {
      try {
        return await fn();
      } catch (error) {
        attempt += 1;
        if (attempt >= this.maxAttempts || !this.isTransient(error)) {
          throw error;
        }
        const backoff = this.baseDelayMs * 2 ** (attempt - 1);
        const jitter = Math.floor(Math.random() * this.baseDelayMs);
        await this.sleep(backoff + jitter);
      }
    }
  }

  isTransient(error: unknown): boolean {
    const code = (error as { code?: string } | null)?.code;
    return typeof code === 'string' && TRANSIENT_CODES.has(code);
  }
}
