import {
  ChargeRequest,
  ChargeResult,
  ChargeStatusQuery,
  ChargeStatusResult,
  IPaymentProvider,
} from '../../core/application/ports/payment-provider.port';
import { ProviderUnavailableError } from '../../core/application/errors/application.errors';
import { FakeProviderMode } from '../config/env.validation';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Simulador del sistema externo de pagos (NO es estado de idempotencia del
 * servicio: vive fuera de nuestros límites). Honra la idempotency key para que
 * el recobro seguro nunca duplique un cargo.
 *
 * Modos:
 *  - success: el cargo se aprueba.
 *  - decline: el cargo es rechazado.
 *  - timeout: el cargo se aprueba en el proveedor, pero la respuesta se pierde
 *             (escenario 4: dinero descontado + timeout de red).
 *  - random: aprueba o rechaza aleatoriamente.
 */
export class FakePaymentProvider implements IPaymentProvider {
  private readonly byOperation = new Map<string, ChargeResult>();
  private readonly byReference = new Map<string, ChargeResult>();

  constructor(
    private readonly mode: FakeProviderMode = 'success',
    private readonly timeoutMs = 0,
  ) {}

  async charge(request: ChargeRequest): Promise<ChargeResult> {
    const existing = this.byOperation.get(request.operationId);
    if (existing) {
      return existing;
    }

    if (this.timeoutMs > 0) {
      await delay(this.timeoutMs);
    }

    const result = this.buildResult(request);
    this.remember(request.operationId, result);

    if (this.mode === 'timeout') {
      // El proveedor ya procesó el cargo, pero la red devuelve timeout.
      throw new ProviderUnavailableError('timeout simulado del proveedor');
    }
    return result;
  }

  async getChargeStatus(query: ChargeStatusQuery): Promise<ChargeStatusResult> {
    const found =
      (query.providerReference ? this.byReference.get(query.providerReference) : undefined) ??
      this.byOperation.get(query.operationId);

    if (!found) {
      return { status: 'NOT_FOUND', providerReference: null };
    }
    return { status: found.status, providerReference: found.providerReference };
  }

  private buildResult(request: ChargeRequest): ChargeResult {
    const providerReference = `ref_${request.operationId.replace(/^op_/, '')}`;
    const declined =
      this.mode === 'decline' ||
      (this.mode === 'random' && Math.random() < 0.5);
    return {
      providerReference,
      status: declined ? 'DECLINED' : 'SUCCEEDED',
    };
  }

  private remember(operationId: string, result: ChargeResult): void {
    this.byOperation.set(operationId, result);
    this.byReference.set(result.providerReference, result);
  }
}
