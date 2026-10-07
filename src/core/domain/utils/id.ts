import { randomBytes } from 'node:crypto';

export function generateOperationId(): string {
  return `op_${randomBytes(8).toString('hex')}`;
}
