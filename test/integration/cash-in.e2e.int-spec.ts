import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Pool } from 'pg';
import { AppModule } from '../../src/app.module';
import { applySchema, createPool, getBalanceCents, seedWallet, truncateAll } from './helpers/db';

describe('Cash-In E2E (HTTP + PostgreSQL real + FakeProvider)', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    process.env.FAKE_PROVIDER_MODE = 'success';
    process.env.WEBHOOK_SECRET = '';

    pool = createPool();
    await applySchema(pool);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  beforeEach(async () => {
    await truncateAll(pool);
    await seedWallet(pool, 'usr_abc123', 'PEN', 25_000);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('recarga exitosa: 200 completed y saldo acreditado', async () => {
    const response = await request(app.getHttpServer())
      .post('/cash-in')
      .set('Idempotency-Key', '3f2504e0-4f89-41d3-9a0c-0305e82c3301')
      .send({ user_id: 'usr_abc123', amount: 100.0, currency: 'PEN', payment_method: 'card_xyz' })
      .expect(200);

    expect(response.body).toMatchObject({ status: 'completed', amount: 100, new_balance: 350 });
    expect(await getBalanceCents(pool)).toBe(35_000);
  });

  it('doble click: el reintento devuelve el mismo payload sin volver a acreditar', async () => {
    const body = { user_id: 'usr_abc123', amount: 100.0, currency: 'PEN', payment_method: 'card_xyz' };
    const key = '8b7d24e0-4f89-41d3-9a0c-0305e82c3399';

    const first = await request(app.getHttpServer())
      .post('/cash-in')
      .set('Idempotency-Key', key)
      .send(body)
      .expect(200);
    const second = await request(app.getHttpServer())
      .post('/cash-in')
      .set('Idempotency-Key', key)
      .send(body)
      .expect(200);

    expect(second.body).toMatchObject({ status: 'completed', new_balance: 350 });
    expect(second.body.operation_id).toBe(first.body.operation_id);
    expect(await getBalanceCents(pool)).toBe(35_000);
  });

  it('rechaza requests sin Idempotency-Key con 400', async () => {
    await request(app.getHttpServer())
      .post('/cash-in')
      .send({ user_id: 'usr_abc123', amount: 10, currency: 'PEN', payment_method: 'card_xyz' })
      .expect(400);
  });
});
