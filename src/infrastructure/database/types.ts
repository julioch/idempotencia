import { QueryResult, QueryResultRow } from 'pg';

/** Abstracción sobre Pool / PoolClient para repositorios ligados a una transacción. */
export interface Queryable {
  query<R extends QueryResultRow = any>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<R>>;
}
