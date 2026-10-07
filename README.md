# Cash-In Service (MVP)

Servicio de recarga de saldo vía pasarela de pagos externa. NestJS 11 + TypeScript
strict + PostgreSQL 16 (`pg`, SQL puro) bajo Arquitectura Hexagonal (Puertos y
Adaptadores). El núcleo de negocio está desacoplado de NestJS y de la base de datos
para permitir su despliegue futuro en AWS Lambda sin cambios.

```
APP -> API -> Cash-In Service -> [ Payment Provider | Wallet / Ledger | DB ]
```

## Arquitectura propuesta

Separación estricta de capas:

```
src/
  core/
    domain/            # TypeScript puro: entidades, value objects, excepciones
      entities/        # Operation (máquina de estados), Wallet, LedgerEntry, WebhookEvent
      value-objects/   # Money (centavos), Currency, OperationStatus, IdempotencyKey
      exceptions/
    application/       # Casos de uso + puertos (interfaces). Sin framework
      ports/           # IPaymentProvider, IWalletLedgerPort, IOperationRepository,
                       # IWebhookRepository, IUnitOfWork, IClock
      use-cases/       # InitiateCashIn, HandlePaymentWebhook, ReconcileOperation
      services/        # CashInProcessor (lógica compartida)
  infrastructure/      # Adaptadores: pg, FakePaymentProvider, scheduler, config
    persistence/       # Repositorios PostgreSQL (SQL puro)
    payment/           # FakePaymentProvider (simulador del sistema externo)
    database/          # Pool, UnitOfWork, RetryPolicy
  interfaces/http/     # Controladores NestJS, DTOs, Guard HMAC
```

- El **dominio** no importa `@nestjs/*`, `pg`, ORM ni clientes HTTP.
- Los **puertos** definen los contratos; los **adaptadores** los implementan.
- La llamada a la pasarela ocurre **fuera** de la transacción de base de datos.

### Puesta en marcha

```bash
npm install
docker compose up -d      # PostgreSQL 16 local
cp .env.example .env      # ajustar DATABASE_URL / WEBHOOK_SECRET
npm run db:migrate
npm run start:dev         # API en http://localhost:3000
```

Tests:

```bash
npm test                # unitarios (mocks de puertos)
npm run test:integration # contra PostgreSQL real (requiere docker up)
npm run lint
npm run build
```

Pruebas manuales: ver `docs/TESTING.md` (runbook con Postman, SQL y scripts de
concurrencia). La colección Postman está en `postman/` y los scripts en
`npm run db:reset`, `npm run load:dup` y `npm run load:race`.

### Endpoints

**POST /cash-in** — header obligatorio `Idempotency-Key` (UUID).

```bash
curl -X POST http://localhost:3000/cash-in \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 3f2504e0-4f89-41d3-9a0c-0305e82c3301" \
  -d '{"user_id":"usr_abc123","amount":100.00,"currency":"PEN","payment_method":"card_xyz"}'
```

Respuesta `200`:

```json
{ "operation_id": "op_9f8e7d", "status": "completed", "amount": 100.00, "new_balance": 350.00 }
```

Códigos: `200` completed, `202` timeout_unknown, `402` failed, `409` en progreso,
`400` validación.

**POST /webhooks/payment** — firma opcional `X-Signature` (HMAC-SHA256).

```bash
curl -X POST http://localhost:3000/webhooks/payment \
  -H "Content-Type: application/json" \
  -d '{"provider_reference":"ref_ext_999","operation_id":"op_9f8e7d","event_type":"payment.succeeded","timestamp":"2026-10-06T22:00:00Z"}'
```

### Modelo de datos

`operations` (con `UNIQUE(user_id, idempotency_key)`), `wallets`
(`PRIMARY KEY(user_id, currency)`, `balance_cents >= 0`), `ledger_entries`
(append-only, `UNIQUE(operation_id, entry_type)`) y `webhook_events`
(`UNIQUE(provider_reference, event_type)`). Los montos son enteros en centavos
(`BIGINT`); el decimal existe solo en el borde HTTP.

### Máquina de estados

```
PENDING_GATEWAY --éxito--> COMPLETED   --decline--> FAILED
PENDING_GATEWAY --timeout/5xx--> TIMEOUT_UNKNOWN (JAMÁS FAILED)
TIMEOUT_UNKNOWN --succeeded--> COMPLETED | --declined--> FAILED
COMPLETED terminal · FAILED terminal salvo webhook payment.succeeded
```

## Estrategia de idempotencia

- **Durable en PostgreSQL**, nunca en memoria. Constraint
  `UNIQUE(user_id, idempotency_key)` en `operations`.
- Al recibir `POST /cash-in` se intenta `INSERT` de la operación en estado
  `PENDING_GATEWAY` (claim). Si PostgreSQL devuelve `23505` (`unique_violation`):
  - `COMPLETED` / `FAILED` → se devuelve el `response_payload` persistido **sin**
    volver a llamar a la pasarela.
  - `PENDING_GATEWAY` reciente → `409 in_progress` (doble click / request concurrente).
  - `PENDING_GATEWAY` estancada (crash) o `TIMEOUT_UNKNOWN` → conciliación activa.
- La clave se envía al proveedor como `Idempotency-Key: <operation_id>`, de modo que
  un recobro seguro jamás duplica el cargo del lado de la pasarela.
- El crédito contable además está protegido por `UNIQUE(operation_id, entry_type)`.

## Manejo de concurrencia

- **Multi-pod**: la unicidad la garantiza la base de datos, no la aplicación.
- **Wallet / Ledger**: toda mutación de saldo ocurre dentro de una transacción con
  `SELECT ... FOR UPDATE` sobre `wallets`, seguida del `INSERT` inmutable en
  `ledger_entries` y del `UPDATE` de saldo — todo atómico.
- **Doble crédito**: el `INSERT ... ON CONFLICT (operation_id, entry_type) DO NOTHING`
  detecta si el asiento ya existía (`alreadyApplied`) y no vuelve a tocar el saldo.
- **Sin locks durante I/O externo**: la llamada a la pasarela nunca corre dentro de
  la transacción, así que un retry de base de datos no retiene locks ni duplica cobros.

## Estrategia de retry

- **Errores transitorios de PostgreSQL** (`40001`, `40P01`, `0800x`, `57P03`,
  `53300`): `RetryPolicy` reintenta la **transacción completa** hasta
  `DB_RETRY_MAX_ATTEMPTS` veces con backoff exponencial + jitter.
- **Timeout / 5xx de la pasarela**: NUNCA se reintenta a ciegas. La operación pasa a
  `TIMEOUT_UNKNOWN` y se responde `202`. El cliente puede reintentar con la misma
  `Idempotency-Key`; entonces se ejecuta **conciliación activa**
  (`getChargeStatus`) antes de decidir si acreditar o recobrar.
- **Reconciliador programado** (`@nestjs/schedule`): cada
  `RECONCILER_INTERVAL_MS` busca operaciones `TIMEOUT_UNKNOWN` o `PENDING_GATEWAY`
  estancadas (`RECONCILER_STALE_MS`) y resuelve su estado.
- Un fallo de base de datos **nunca** provoca una segunda llamada al proveedor.

## Manejo de webhooks

- Deduplicación durable con `UNIQUE(provider_reference, event_type)`; un duplicado
  responde `200 OK` sin modificar el saldo.
- **Fuera de orden**: la resolución es por precedencia de estados, no por timestamp.
  `COMPLETED` es terminal y un evento de fallo posterior se marca `IGNORED`.
  `FAILED` puede pasar a `COMPLETED` si llega un `payment.succeeded` (el dinero sí se
  movió; la pasarela es la fuente de verdad).
- **Webhook antes que la respuesta del API**: la fila de la operación existe desde
  antes de llamar a la pasarela, por lo que el webhook puede completarla; el crédito
  es idempotente gracias al índice único del ledger. La respuesta síncrona posterior
  no duplica el saldo.
- Operación desconocida → el evento se guarda como `ORPHAN`.
- **Firma HMAC-SHA256** opcional sobre el body crudo (`X-Signature`). Sin
  `WEBHOOK_SECRET` el endpoint opera en modo demo.

## Los 10 escenarios de borde

| # | Escenario | Mecanismo |
|---|-----------|-----------|
| 1 | Doble click | `UNIQUE(user_id, idempotency_key)` + replay de `response_payload` |
| 2 | Retry de la app | Misma key + conciliación antes de recobrar |
| 3 | Múltiples pods | Constraint único real multi-conexión |
| 4 | Timeout del proveedor | `TIMEOUT_UNKNOWN` + `getChargeStatus` |
| 5 | Webhook duplicado | `UNIQUE(provider_reference, event_type)` |
| 6 | Webhook fuera de orden | Precedencia de estados (COMPLETED gana) |
| 7 | Webhook antes de la respuesta | Fila creada pre-cargo + ledger único |
| 8 | Fallo temporal de DB | `RetryPolicy` transaccional, sin re-llamar a la pasarela |
| 9 | Reinicio del servicio | Fila `PENDING_GATEWAY` persistida + takeover/reconciler |
| 10 | Race de saldo | Transacción ACID + `SELECT ... FOR UPDATE` |

## Configuración (`.env`)

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | Connection string de PostgreSQL/Supabase |
| `DATABASE_SSL` | `true` para Supabase |
| `WEBHOOK_SECRET` | Secreto HMAC (vacío = modo demo) |
| `FAKE_PROVIDER_MODE` | `success` \| `decline` \| `timeout` \| `random` |
| `FAKE_PROVIDER_TIMEOUT_MS` | Latencia simulada del proveedor |
| `DB_RETRY_MAX_ATTEMPTS` / `DB_RETRY_BASE_DELAY_MS` | Política de reintentos transaccionales |
| `RECONCILER_ENABLED` / `RECONCILER_INTERVAL_MS` / `RECONCILER_STALE_MS` | Reconciliador |

## Notas y límites del MVP

- `FakePaymentProvider` simula la pasarela y **honra la idempotency key**; en
  producción basta implementar `IPaymentProvider` con un cliente HTTP real
  (`POST /charges`, `GET /charges/:id`) sin tocar el dominio.
- El recobro seguro depende de que la pasarela real respete el header
  `Idempotency-Key`; se documenta como supuesto de integración.
- Supabase requiere SSL/pooler configurado vía `DATABASE_URL` + `DATABASE_SSL=true`.
