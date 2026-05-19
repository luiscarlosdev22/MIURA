import { query } from '../config/database'
import { logger } from '../config/logger'

export type LeadStatus = 'NOVO' | 'QUENTE' | 'MORNO' | 'FRIO' | 'CONVERTIDO' | 'DESCARTADO'

export interface Lead {
  id: number
  phone: string
  name: string | null
  city: string | null
  status: LeadStatus
  has_shop: boolean | null
  use_type: string | null
  monthly_cars: number | null
  buy_deadline: string | null
  payment_type: string | null
  decides_alone: boolean | null
  source: string
  seller_notified: boolean
  awaiting_followup_at: Date | null
  created_at: Date
  updated_at: Date
}

export async function runMigrations(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS leads (
      id               SERIAL PRIMARY KEY,
      phone            VARCHAR(20) UNIQUE NOT NULL,
      name             VARCHAR(100),
      city             VARCHAR(100),
      status           VARCHAR(20) NOT NULL DEFAULT 'NOVO',
      has_shop         BOOLEAN,
      use_type         VARCHAR(20),
      monthly_cars     INTEGER,
      buy_deadline     VARCHAR(50),
      payment_type     VARCHAR(50),
      decides_alone    BOOLEAN,
      source           VARCHAR(50) NOT NULL DEFAULT 'whatsapp',
      seller_notified  BOOLEAN NOT NULL DEFAULT FALSE,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id         SERIAL PRIMARY KEY,
      phone      VARCHAR(20) NOT NULL,
      role       VARCHAR(10) NOT NULL,
      content    TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await query(`
    CREATE INDEX IF NOT EXISTS idx_conversations_phone
    ON conversations(phone, created_at DESC)
  `)
  await query(`
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS awaiting_followup_at TIMESTAMPTZ
  `)
  logger.info('Migrations executadas com sucesso')
}

export async function findOrCreateLead(phone: string, name?: string): Promise<Lead> {
  const rows = await query<Lead>('SELECT * FROM leads WHERE phone = $1', [phone])
  if (rows.length > 0) return rows[0]
  const created = await query<Lead>(
    'INSERT INTO leads (phone, name) VALUES ($1, $2) RETURNING *',
    [phone, name ?? null]
  )
  logger.info(`Novo lead criado: ${phone}`)
  return created[0]
}

export async function updateLead(
  phone: string,
  data: Partial<Omit<Lead, 'id' | 'phone' | 'created_at' | 'updated_at'>>
): Promise<void> {
  const fields = Object.keys(data)
  if (fields.length === 0) return
  const setClause = fields.map((f, i) => `${f} = $${i + 2}`).join(', ')
  const values = Object.values(data)
  await query(
    `UPDATE leads SET ${setClause}, updated_at = NOW() WHERE phone = $1`,
    [phone, ...values]
  )
}

export async function getAllLeads(): Promise<Lead[]> {
  return query<Lead>('SELECT * FROM leads ORDER BY created_at DESC')
}
