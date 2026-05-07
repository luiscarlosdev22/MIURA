import { Pool } from 'pg'
import { env } from './env'
import { logger } from './logger'

export const db = new Pool({
  connectionString: env.database.url,
  ssl: env.isDev ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})

export async function connectDatabase(): Promise<void> {
  try {
    const client = await db.connect()
    logger.info('PostgreSQL conectado com sucesso')
    client.release()
  } catch (error) {
    logger.error('Falha ao conectar PostgreSQL', { error })
    throw error
  }
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await db.query(text, params)
  return result.rows as T[]
}
