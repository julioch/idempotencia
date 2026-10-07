import { IClock } from '../../core/application/ports/clock.port';

export class SystemClock implements IClock {
  now(): Date {
    return new Date();
  }
}
