export interface PgErrorLike {
  code?: string;
  constraint?: string;
  message?: string;
}

export function isUniqueViolation(error: unknown): error is PgErrorLike {
  return (error as PgErrorLike | null)?.code === '23505';
}
