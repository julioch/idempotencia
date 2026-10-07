# Guía de pruebas manuales — Cash-In Service

Runbook para ejercitar los 10 escenarios de borde combinando **Postman** (capa HTTP),
**SQL** (verificación/reset) y **scripts** (concurrencia). Los escenarios 3, 8 y 10
requieren concurrencia real o control del proceso/BD, por lo que no se pueden forzar
de forma fiable solo con Postman; para ellos se usan los scripts incluidos.

## 1. Prerrequisitos

```bash
npm install
docker compose up -d          # PostgreSQL 16 en localhost:5432
npm run db:migrate            # tablas + wallet de demo (250.00 PEN)
npm run start:dev             # API en http://localhost:3000
```

El **FakePaymentProvider es un simulador en memoria del proceso**: su modo y su
latencia se fijan al arrancar. Para cambiar de modo hay que **reiniciar** el servidor.

| Modo (`FAKE_PROVIDER_MODE`) | Efecto |
|-----------------------------|--------|
| `success` (defecto) | El cargo se aprueba → `200 completed`. |
| `decline` | El cargo se rechaza → `402 failed`. |
| `timeout` | El proveedor cobra pero la respuesta se pierde → `202 timeout_unknown`. |
| `random` | Aprueba o rechaza al azar. |

Arranque por modo (PowerShell):

```powershell
$env:FAKE_PROVIDER_MODE="timeout"; npm run start:dev
```

Para una latencia simulada (útil en el escenario 7): `$env:FAKE_PROVIDER_TIMEOUT_MS="5000"`.

## 2. Importar la colección Postman

1. Importa `postman/Cash-In-Service.postman_collection.json`.
2. Importa y activa `postman/Cash-In-Service.postman_environment.json`.
3. Variables: `baseUrl`, `userId`, `idempotencyKey` (UUID fijo), `webhookSecret`
   (vacío = modo demo), y `operationId`/`providerReference` que se autocompletan tras
   la primera llamada a `POST /cash-in`.

## 3. Utilidades SQL

```bash
# Inspección
docker exec cashin-postgres psql -U postgres -d cashin -c "SELECT status, provider_reference, response_payload FROM operations;"
docker exec cashin-postgres psql -U postgres -d cashin -c "SELECT * FROM wallets;"
docker exec cashin-postgres psql -U postgres -d cashin -c "SELECT operation_id, entry_type, amount_cents, balance_after_cents FROM ledger_entries;"
docker exec cashin-postgres psql -U postgres -d cashin -c "SELECT provider_reference, event_type, status FROM webhook_events;"
```

```bash
# Reset entre escenarios (deja la wallet en 250.00 PEN)
npm run db:reset
```

## 4. Escenarios

### 1. Doble click (`UNIQUE(user_id, idempotency_key)`)
- Postman: carpeta **"1. Doble click"** → ejecuta **1.1** y luego **1.2**.
- Esperado: ambas `200` con el **mismo** `operation_id` y `new_balance` (la 2ª es replay).
  Si son concurrentes puede verse `409 in_progress`.
- Verifica: `SELECT COUNT(*) FROM ledger_entries;` → `1`.

### 2. Retry de la app (conciliación antes de recobrar)
- Arranca en modo `timeout`.
- Envía `POST /cash-in` con la key `A` → `202 timeout_unknown`.
- **Reinicia** en modo `success` (limpia el estado del simulador) y repite con la key `A`.
- Esperado: `200 completed` (el servicio concilia con `getChargeStatus` antes de cobrar).

### 3. Múltiples pods (concurrencia, misma key)
- Script:
  ```bash
  npm run load:dup    # node scripts/concurrent-cash-in.mjs http://localhost:3000 10 same
  ```
- Esperado: **1** `operation_id` distinto y **1** sola fila en `ledger_entries`.

### 4. Timeout del proveedor
- Arranca en modo `timeout`.
- `POST /cash-in` → `202` con `status: "timeout_unknown"` (NUNCA `402`).
- Verifica: `SELECT status FROM operations;` → `TIMEOUT_UNKNOWN`.

### 5. Webhook duplicado (`UNIQUE(provider_reference, event_type)`)
- Tras un cash-in exitoso, ejecuta **5.1** y **5.2** (mismo body).
- Esperado: ambas `200 { "received": true }`; el saldo sube **una** vez.
- Verifica: `SELECT COUNT(*) FROM ledger_entries;` y el saldo en `wallets`.

### 6. Webhook fuera de orden
- **Variante A (después de COMPLETED):** envía **5.1** (`payment.succeeded`) y luego **6.1**
  (`payment.failed`). El de fallo queda en `webhook_events.status = 'IGNORED'` y el saldo
  no cambia.
- **Variante B (independiente del orden):** en modo `timeout` deja una op en
  `TIMEOUT_UNKNOWN`; envía `payment.failed` (→ `FAILED`); luego `payment.succeeded`
  (→ `COMPLETED` y acredita). Demuestra que el orden no importa.
- Verifica: `SELECT event_type, status FROM webhook_events;`
  `SELECT status FROM operations;`

### 7. Webhook antes de la respuesta del API (parcial)
El cliente no conoce el `operation_id` antes de la respuesta, así que se simula por SQL:
```sql
-- 1) Crea una operación PENDING con id conocido
INSERT INTO operations (id, user_id, idempotency_key, amount_cents, currency, payment_method, status)
VALUES ('op_manual_1', 'usr_abc123', '8b7d24e0-4f89-41d3-9a0c-0305e82c3302', 10000, 'PEN', 'card_xyz', 'PENDING_GATEWAY');
```
- Envía el webhook con `operation_id = op_manual_1` y un `provider_reference` cualquiera.
  → acredita y marca `COMPLETED`.
- Luego `POST /cash-in` con esa `Idempotency-Key` → devuelve el replay `completed`
  **sin** volver a acreditar (ledger único).
- Alternativa: con `FAKE_PROVIDER_TIMEOUT_MS=5000` y dos ventanas de Postman, envía el
  webhook durante la espera (necesitas conocer el `operation_id`, que se autocompleta
  solo cuando responde el cash-in; por eso la vía SQL es la recomendada).

### 8. Fallo temporal de DB (no viable con Postman)
- Cubierto por tests automatizados: `RetryPolicy` (unit) y `test:integration`.
- Si quieres verlo manualmente, `docker pause cashin-postgres` provoca errores de
  conexión (no un `40001/40P01` limpio), por eso se documenta como escenario de test.

### 9. Reinicio del servicio (takeover)
- En modo `timeout`, envía un cash-in → queda `TIMEOUT_UNKNOWN`.
- Reinicia el servidor (Ctrl+C y `npm run start:dev`).
- El **reconciliador** (cada `RECONCILER_INTERVAL_MS`, por defecto 60 s) resuelve la
  operación: como el simulador perdió su estado, `getChargeStatus` → `NOT_FOUND` y hace
  **recobro seguro** con la misma idempotency key.
- Verifica los logs: `Reconciliador activo cada 60000 ms` y el cambio de estado en `operations`.

### 10. Race de saldo (`SELECT ... FOR UPDATE`)
- Script (claves distintas, mismo usuario):
  ```bash
  npm run load:race   # node scripts/concurrent-cash-in.mjs http://localhost:3000 10 distinct
  ```
- Esperado: saldo final = inicial + `N * amount` (sin actualizaciones perdidas) y
  `ledger_entries` con N filas.

### Extra — Decline
- Reinicia en modo `decline`; `POST /cash-in` → `402` con `status: "failed"`.

### Extra — Firma HMAC
- Arranca con `$env:WEBHOOK_SECRET="supersecreto"`.
- Ajusta `webhookSecret` en el environment de Postman y ejecuta **"Webhook firmado"**
  → `200` (firma HMAC-SHA256 válida sobre el body crudo).
- **"Webhook con firma inválida"** → `401`.
- Sin `WEBHOOK_SECRET` el guard opera en modo demo (permite todo).

## 5. Scripts npm disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run db:reset` | Trunca tablas y re-siembra la wallet en 250.00 PEN |
| `npm run load:dup` | 10 requests concurrentes con la misma key (escenario 3) |
| `npm run load:race` | 10 requests concurrentes con claves distintas (escenario 10) |
| `npm test` | Suite unitaria (mocks) |
| `npm run test:integration` | Suite contra PostgreSQL real (Docker) |

## 6. Cobertura automatizada vs manual

Los escenarios 1–10 están cubiertos por la suite automatizada (ver `npm test` y
`npm run test:integration`). Esta guía sirve para una demostración manual/una revisión
del comportamiento observable por HTTP. Para reproducción determinista, prefiere los
tests.
