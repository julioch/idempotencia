---
name: clean-architecture-ddd
description: Reglas de separación de capas según Domain-Driven Design y Arquitectura Hexagonal.
triggers:
  - domain
  - usecase
  - architecture
  - module
---

# Clean Architecture y Límites DDD

1. **Aislamiento del Dominio (`src/core/domain`):**
   - Clases puras de TypeScript. Cero dependencias de `@nestjs/*`, TypeORM, Kysely, Prisma o clientes HTTP.
   - Las entidades (`Operation`, `Wallet`) deben encapsular sus propias transiciones de estado e invariantes de negocio.

2. **Puertos y Adaptadores (`src/core/application` e `infrastructure`):**
   - La capa de aplicación define interfaces/puertos: `IOperationRepository`, `IWalletRepository`, `IPaymentGateway`.
   - La capa de infraestructura implementa las conexiones a PostgreSQL y el cliente HTTP hacia la pasarela.
   - Mantén el núcleo desacoplado para que el controlador NestJS pueda ejecutarse localmente con Express o empaquetarse en un handler de AWS Lambda sin tocar el dominio.