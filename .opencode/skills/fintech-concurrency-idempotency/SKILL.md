---
name: fintech-concurrency-idempotency
description: Reglas obligatorias para manejo de transacciones financieras, concurrencia multi-pod, idempotencia en base de datos y control de timeouts.
triggers:
  - cash-in
  - webhook
  - idempotency
  - database
  - concurrency
  - payment
---

# Reglas de Concurrencia e Idempotencia Financiera

Aplica estas directivas de forma estricta en cualquier lógica de pagos o base de datos:

1. **Idempotencia Multi-Pod en Base de Datos:**
   - Queda estrictamente prohibido usar memoria volátil (Maps, Sets, cachés locales en RAM) para validar idempotencia.
   - Toda validación de idempotencia debe ser durable en PostgreSQL mediante el constraint `UNIQUE(user_id, idempotency_key)` en la tabla `operations`.
   - Captura explícitamente el código de error `23505` (`unique_violation`) de PostgreSQL. Si la operación colisiona:
     - Si ya finalizó (`COMPLETED`), retorna el `response_payload` almacenado.
     - Si está en progreso (`PENDING_GATEWAY`), gestiona el estado sin invocar a la pasarela externa.

2. **Integridad Contable (Wallet y Ledger):**
   - Toda mutación de saldo en la tabla `wallets` debe ejecutarse dentro de una transacción con bloqueo pesimista explícito (`SELECT ... FOR UPDATE`).
   - Cada crédito o débito debe generar un registro inmutable en `ledger_entries` dentro de la misma transacción relacional.

3. **Política Estricta ante Timeouts del Proveedor:**
   - NUNCA ejecutes reintentos HTTP a ciegas contra la pasarela externa.
   - Ante un Network Timeout o error 5xx indeterminado, la operación debe quedar en estado `TIMEOUT_UNKNOWN` (nunca `FAILED`).
   - Ante un reintento del cliente con la misma llave, implementa una verificación activa (`GET /charges/:id`) hacia la pasarela antes de decidir si acreditar saldo o reportar fallo.

4. **Webhooks Idempotentes y Desordenados:**
   - Asume que los webhooks pueden llegar duplicados, con retraso o antes que la respuesta síncrona del API.
   - Persiste cada evento en `webhook_events` con constraint `UNIQUE(provider_reference, event_type)`.
   - Si el evento ya fue procesado o la operación ya fue acreditada, retorna `200 OK` de inmediato sin volver a modificar el saldo.