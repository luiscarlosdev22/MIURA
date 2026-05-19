import { Pool } from 'pg'
import { env } from './env'
import { logger } from './logger'

// SSL só é necessário quando o banco é REMOTO (ex: deploy em Railway).
// Local (Docker no Mac) não tem SSL e o NODE_ENV não é confiável aqui.
// Critério mais robusto: detectar pelo host no DATABASE_URL.
const isLocalDb = /localhost|127\.0\.0\.1|@postgres:/.test(env.database.url)
const sslConfig = isLocalDb ? false : { rejectUnauthorized: false }

export const db = new Pool({
  connectionString: env.database.url,
  ssl: sslConfig,
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
    logger.error('Falha ao conectar PostgreSQL', {
      message: (error as Error)?.message,
      code: (error as any)?.code,
      stack: (error as Error)?.stack,
    })
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
