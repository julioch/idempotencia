import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { HmacSignatureGuard } from '../../../src/interfaces/http/guards/hmac-signature.guard';

function buildContext(rawBody: Buffer, signature?: string) {
  const request = {
    rawBody,
    body: JSON.parse(rawBody.toString()),
    headers: signature ? { 'x-signature': signature } : {},
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

function configWithSecret(secret: string): ConfigService {
  return { get: jest.fn(() => secret) } as unknown as ConfigService;
}

describe('HmacSignatureGuard', () => {
  const body = Buffer.from(JSON.stringify({ provider_reference: 'ref_ext_999' }));

  it('permite un webhook con firma HMAC válida', () => {
    const signature = createHmac('sha256', 'secret').update(body).digest('hex');
    const guard = new HmacSignatureGuard(configWithSecret('secret'));

    expect(guard.canActivate(buildContext(body, signature))).toBe(true);
  });

  it('rechaza una firma inválida', () => {
    const guard = new HmacSignatureGuard(configWithSecret('secret'));
    expect(() => guard.canActivate(buildContext(body, 'deadbeef'))).toThrow(UnauthorizedException);
  });

  it('rechaza cuando falta la firma', () => {
    const guard = new HmacSignatureGuard(configWithSecret('secret'));
    expect(() => guard.canActivate(buildContext(body))).toThrow(UnauthorizedException);
  });

  it('permite todo en modo demo (sin secreto configurado)', () => {
    const guard = new HmacSignatureGuard(configWithSecret(''));
    expect(guard.canActivate(buildContext(body))).toBe(true);
  });
});
