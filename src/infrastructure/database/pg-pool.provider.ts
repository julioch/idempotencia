import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';

export function createPgPool(config: ConfigService): Pool {
  const useSsl = config.get<boolean>('DATABASE_SSL');
  return new Pool({
    connectionString: config.get<string>('DATABASE_URL'),
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  });
}
