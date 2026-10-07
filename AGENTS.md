# AGENTS.md — Cash-In Service

Instrucciones permanentes para opencode en este repositorio. Leer SIEMPRE antes de
trabajar. El plan aprobado vive en `docs/PLAN.md`.

## Skills obligatorios (leer antes de codificar)

Antes de tocar dominio, casos de uso, pagos o base de datos, cargar y aplicar los
skills ubicados en `.opencode/skills/`:

- `tdd-jest-workflow` → cada `*.spec.ts` se escribe antes del código de producción
  (Red-Green-Refactor), patrón AAA, solo se mockean puertos.
- `clean-architecture-ddd` → el dominio en `src/core/domain` es TypeScript puro;
  cero imports de `@nestjs/*`, `pg`, ORM o clientes HTTP. Puertos en
  `src/core/application`, adaptadores en `src/infrastructure`.
- `fintech-concurrency-idempotency` → idempotencia durable en PostgreSQL,
  `SELECT ... FOR UPDATE`, timeouts nunca marcan `FAILED`, webhooks idempotentes y
  desordenados.

## Reglas anti-red-flag (no negociables)

- PROHIBIDO idempotencia en memoria (Map/Set/RAM). Es durable: `UNIQUE(user_id, idempotency_key)`.
- PROHIBIDO reintentar a ciegas el cobro ante timeouts. Ante timeout/5xx → `TIMEOUT_UNKNOWN` y conciliación activa.
- PROHIBIDO asumir webhooks únicos o en orden. `UNIQUE(provider_reference, event_type)` + estado terminal.
- PROHIBIDO entregar código sin pruebas automatizadas.
- PROHIBIDO `float` para dinero: internamente centavos (`BIGINT`), decimal solo en el borde HTTP.

## Stack

NestJS 11 · TypeScript strict · `pg` (SQL puro, sin ORM) · PostgreSQL 16 ·
Jest · `@nestjs/config`, `@nestjs/schedule`, `class-validator`.

## Comandos

```bash
npm install
docker compose up -d            # PostgreSQL local
npm run db:migrate              # aplica db/001_schema.sql + db/002_seed.sql
npm test                        # unit tests (mocks)
npm run test:integration        # tests contra PostgreSQL real (Docker)
npm run lint
npm run build
npm run start:dev               # API en http://localhost:3000
```

## Convenciones

- Montos: VO `Money` en centavos; validar 2 decimales en el borde.
- Nombres de puertos: `IPaymentProvider`, `IWalletLedgerPort`, `IOperationRepository`,
  `IWebhookRepository`, `IUnitOfWork`, `IClock`.
- Toda mutación de saldo ocurre dentro de una transacción con `SELECT ... FOR UPDATE`
  y su `ledger_entries` en la misma transacción.
- La llamada al proveedor ocurre FUERA de la transacción de base de datos.
