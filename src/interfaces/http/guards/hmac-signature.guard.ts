import {
  CanActivate,
  ExecutionContext,
  Injectable,
  RawBodyRequest,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';

@Injectable()
export class HmacSignatureGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.config.get<string>('WEBHOOK_SECRET');
    if (!secret) {
      // Modo demo: sin secreto configurado no se valida la firma.
      return true;
    }

    const request = context.switchToHttp().getRequest<RawBodyRequest<Request>>();
    const header = request.headers['x-signature'];
    const signature = Array.isArray(header) ? header[0] : header;
    if (!signature) {
      throw new UnauthorizedException('Falta la firma del webhook');
    }

    const raw = request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {}));
    const expected = createHmac('sha256', secret).update(raw).digest('hex');

    const expectedBuffer = Buffer.from(expected);
    const providedBuffer = Buffer.from(signature);
    if (
      expectedBuffer.length !== providedBuffer.length ||
      !timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      throw new UnauthorizedException('Firma de webhook inválida');
    }

    return true;
  }
}
