import { InvalidIdempotencyKeyError } from '../exceptions/domain.exception';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class IdempotencyKey {
  private constructor(readonly value: string) {}

  static from(value: string): IdempotencyKey {
    if (typeof value !== 'string' || !UUID_RE.test(value)) {
      throw new InvalidIdempotencyKeyError(value);
    }
    return new IdempotencyKey(value.toLowerCase());
  }
}
