export type FakeProviderMode = 'success' | 'decline' | 'timeout' | 'random';

export interface AppEnv {
  NODE_ENV: string;
  PORT: number;
  DATABASE_URL: string;
  DATABASE_SSL: boolean;
  WEBHOOK_SECRET: string;
  FAKE_PROVIDER_MODE: FakeProviderMode;
  FAKE_PROVIDER_TIMEOUT_MS: number;
  DB_RETRY_MAX_ATTEMPTS: number;
  DB_RETRY_BASE_DELAY_MS: number;
  RECONCILER_ENABLED: boolean;
  RECONCILER_INTERVAL_MS: number;
  RECONCILER_STALE_MS: number;
}

function toNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

export function validateEnv(config: Record<string, unknown>): AppEnv {
  const mode = (config.FAKE_PROVIDER_MODE as FakeProviderMode) ?? 'success';

  return {
    NODE_ENV: String(config.NODE_ENV ?? 'development'),
    PORT: toNumber(config.PORT, 3000),
    DATABASE_URL: String(
      config.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/cashin',
    ),
    DATABASE_SSL: toBoolean(config.DATABASE_SSL, false),
    WEBHOOK_SECRET: String(config.WEBHOOK_SECRET ?? ''),
    FAKE_PROVIDER_MODE: mode,
    FAKE_PROVIDER_TIMEOUT_MS: toNumber(config.FAKE_PROVIDER_TIMEOUT_MS, 0),
    DB_RETRY_MAX_ATTEMPTS: toNumber(config.DB_RETRY_MAX_ATTEMPTS, 3),
    DB_RETRY_BASE_DELAY_MS: toNumber(config.DB_RETRY_BASE_DELAY_MS, 50),
    RECONCILER_ENABLED: toBoolean(config.RECONCILER_ENABLED, true),
    RECONCILER_INTERVAL_MS: toNumber(config.RECONCILER_INTERVAL_MS, 60_000),
    RECONCILER_STALE_MS: toNumber(config.RECONCILER_STALE_MS, 30_000),
  };
}
