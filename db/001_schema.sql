-- Cash-In Service - Esquema relacional (PostgreSQL / Supabase)
-- Idempotencia durable, integridad contable y deduplicacion de webhooks.

BEGIN;

CREATE TABLE IF NOT EXISTS operations (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL,
  idempotency_key    UUID NOT NULL,
  amount_cents       BIGINT NOT NULL CHECK (amount_cents > 0),
  currency           CHAR(3) NOT NULL,
  payment_method     TEXT NOT NULL,
  status             TEXT NOT NULL CHECK (status IN ('PENDING_GATEWAY', 'TIMEOUT_UNKNOWN', 'COMPLETED', 'FAILED')),
  provider_reference TEXT,
  response_payload   JSONB,
  failure_reason     TEXT,
  retry_count        INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at       TIMESTAMPTZ,
  CONSTRAINT uq_operations_user_idempotency UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_operations_provider_reference
  ON operations (provider_reference);
CREATE INDEX IF NOT EXISTS idx_operations_status_updated
  ON operations (status, updated_at);

CREATE TABLE IF NOT EXISTS wallets (
  user_id       TEXT NOT NULL,
  currency      CHAR(3) NOT NULL,
  balance_cents BIGINT NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  version       BIGINT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, currency)
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id                  BIGSERIAL PRIMARY KEY,
  operation_id        TEXT NOT NULL REFERENCES operations (id),
  user_id             TEXT NOT NULL,
  entry_type          TEXT NOT NULL CHECK (entry_type IN ('CREDIT', 'DEBIT')),
  amount_cents        BIGINT NOT NULL CHECK (amount_cents > 0),
  currency            CHAR(3) NOT NULL,
  balance_after_cents BIGINT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_ledger_operation_entry UNIQUE (operation_id, entry_type)
);

CREATE INDEX IF NOT EXISTS idx_ledger_user
  ON ledger_entries (user_id, created_at);

CREATE TABLE IF NOT EXISTS webhook_events (
  id                 BIGSERIAL PRIMARY KEY,
  provider_reference TEXT NOT NULL,
  event_type         TEXT NOT NULL,
  operation_id       TEXT,
  payload            JSONB NOT NULL,
  status             TEXT NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED', 'PROCESSED', 'IGNORED', 'ORPHAN')),
  received_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at       TIMESTAMPTZ,
  CONSTRAINT uq_webhook_reference_event UNIQUE (provider_reference, event_type)
);

CREATE INDEX IF NOT EXISTS idx_webhook_status
  ON webhook_events (status, received_at);

COMMIT;
