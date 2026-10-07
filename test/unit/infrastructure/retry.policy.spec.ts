import { RetryPolicy } from '../../../src/infrastructure/database/retry.policy';

const sleep = jest.fn(async () => undefined);

function pgError(code: string): Error {
  return Object.assign(new Error(`pg error ${code}`), { code });
}

describe('RetryPolicy (fallo temporal de DB)', () => {
  beforeEach(() => sleep.mockClear());

  it('reintenta ante SQLSTATE transitorio y termina en éxito', async () => {
    const policy = new RetryPolicy(3, 1, sleep);
    const fn = jest
      .fn()
      .mockRejectedValueOnce(pgError('40P01'))
      .mockRejectedValueOnce(pgError('40001'))
      .mockResolvedValue('ok');

    await expect(policy.execute(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('no reintenta errores no transitorios (p. ej. 23505)', async () => {
    const policy = new RetryPolicy(3, 1, sleep);
    const fn = jest.fn().mockRejectedValue(pgError('23505'));

    await expect(policy.execute(fn)).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('se rinde tras agotar maxAttempts', async () => {
    const policy = new RetryPolicy(2, 1, sleep);
    const fn = jest.fn().mockRejectedValue(pgError('40001'));

    await expect(policy.execute(fn)).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
