# Plan aprobado — Servicio de recarga de saldo (Cash-In) MVP

Flujo: `APP -> API -> Cash-In Service -> [ Payment Provider | Wallet / Ledger | DB ]`

Arquitectura Hexagonal (Puertos y Adaptadores). Núcleo desacoplado para permitir
despliegue futuro en AWS Lambda sin alterar el dominio.

## Decisiones confirmadas

- Persistencia: `pg` (node-postgres) con SQL puro. Sin ORM.
- Proveedor de pagos: `FakePaymentProvider` interno configurable (success/decline/timeout/random)
  que simula `POST /charges` y `GET /charges/:id`, con idempotencia de proveedor.
- Tests: unitarios con mocks + integración contra PostgreSQL real en Docker.
- Reconciliación: job programado (`@nestjs/schedule`) + conciliación ante retry del cliente.
- Webhooks: firma HMAC-SHA256 con secreto configurable (vacío = modo demo).
- Montos en centavos (`BIGINT`) en dominio y DB; decimal solo en el borde HTTP.

## Endpoints

1. `POST /cash-in` — header `Idempotency-Key` (UUID). Body `{ user_id, amount, currency, payment_method }`.
   Respuesta 200 `{ operation_id, status:"completed", amount, new_balance }` (202 `timeout_unknown`, 402 `failed`, 409 en progreso).
2. `POST /webhooks/payment` — body `{ provider_reference, operation_id, event_type, timestamp }`. 200 OK.

## DDL (resumen)

- `operations`: PK `id`, `UNIQUE(user_id, idempotency_key)`, `status`, `response_payload JSONB`, índices por `provider_reference` y `(status, updated_at)`.
- `wallets`: PK `(user_id, currency)`, `balance_cents BIGINT CHECK >= 0`.
- `ledger_entries` (append-only): `UNIQUE(operation_id, entry_type)`.
- `webhook_events`: `UNIQUE(provider_reference, event_type)`, `status`.

## Máquina de estados

```
PENDING_GATEWAY --éxito--> COMPLETED      --decline--> FAILED
PENDING_GATEWAY --timeout/5xx--> TIMEOUT_UNKNOWN (JAMÁS FAILED)
TIMEOUT_UNKNOWN --succeeded--> COMPLETED | --declined--> FAILED
COMPLETED terminal · FAILED terminal salvo webhook payment.succeeded
PENDING_GATEWAY huérfano (crash) -> takeover por retry/reconciler
```

## Suites de tests

- Dominio: transiciones de `Operation`, invariantes `Wallet`/`Money`.
- `InitiateCashInUseCase`: happy path, replay idempotente, colisión `23505`, timeout→`TIMEOUT_UNKNOWN`, retry→conciliación, decline, fallo DB transitorio.
- `HandlePaymentWebhookUseCase`: duplicado, webhook antes de la respuesta API, fuera de orden, ORPHAN.
- `ReconcileOperationUseCase`: succeeded/declined/pending/NOT_FOUND.
- `RetryPolicy`: reintentos solo en SQLSTATE transitorios.
- `HmacSignatureGuard`: firma válida/ inválida.
- Integración (Docker): `23505` real, concurrencia misma key, `FOR UPDATE` serializa saldo, webhook duplicado.

## Mapa de los 10 escenarios de borde

1. Doble click → `UNIQUE(user_id, idempotency_key)` + replay de `response_payload`.
2. Retry de la app → misma key, conciliación antes de recobrar.
3. Múltiples pods → constraint único real multi-conexión.
4. Timeout del proveedor → `TIMEOUT_UNKNOWN` + `GET /charges/:id`.
5. Webhook duplicado → `UNIQUE(provider_reference, event_type)`.
6. Webhook fuera de orden → precedencia de estados (COMPLETED gana).
7. Webhook antes de la respuesta → fila de operación creada pre-cargo + ledger único.
8. Fallo temporal de DB → `RetryPolicy` transaccional, sin re-llamar al proveedor.
9. Reinicio del servicio → fila `PENDING_GATEWAY` persistida, takeover/reconciler.
10. Race de saldo → transacción ACID + `SELECT ... FOR UPDATE`.

## Entregables (orden)

1. DDL + scaffolding. 2. Dominio puro + specs. 3. Puertos. 4. Specs de casos de uso.
5. Casos de uso + infraestructura + controladores. 6. Tests de integración. 7. README.
