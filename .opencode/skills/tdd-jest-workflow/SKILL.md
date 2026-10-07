---
name: tdd-jest-workflow
description: Estándares estrictos para desarrollo guiado por pruebas (TDD) y pruebas unitarias con Jest.
triggers:
  - test
  - spec
  - tdd
  - jest
---

# Protocolo TDD con Jest

1. **Ciclo Red-Green-Refactor:**
   - Escribe siempre la prueba unitaria (`*.spec.ts`) antes de implementar el código de producción en el caso de uso o entidad.
   - Asegura que la prueba falle inicialmente por la razón correcta antes de añadir la lógica.

2. **Estructura y Cobertura Obligatoria:**
   - Estructura cada test bajo el patrón AAA (Arrange, Act, Assert).
   - Mockea únicamente las interfaces de los puertos (`IOperationRepository`, `IPaymentGateway`). Prohibido mockear la lógica interna del dominio.
   - Cada caso de uso debe incluir como mínimo:
     - Escenario de éxito (Happy Path con saldo actualizado).
     - Idempotencia ante llamadas idénticas consecutivas (sin invocar gateway secundario).
     - Manejo de timeout de red y transición a `TIMEOUT_UNKNOWN`.
     - Invocación de webhook duplicado (sin duplicar balance).
     - Validación de errores de unicidad de base de datos.