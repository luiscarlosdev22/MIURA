import { query } from '../config/database'
import { ChatMessage } from '../services/ai'

export async function saveMessage(
  phone: string,
  role: 'user' | 'assistant',
  content: string
): Promise<void> {
  await query(
    'INSERT INTO conversations (phone, role, content) VALUES ($1, $2, $3)',
    [phone, role, content]
  )
}

export async function getHistory(phone: string, limit = 10): Promise<ChatMessage[]> {
  const rows = await query<{ role: string; content: string }>(
    `SELECT role, content FROM conversations
     WHERE phone = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [phone, limit]
  )
  return rows.reverse() as ChatMessage[]
}

export async function countMessages(phone: string): Promise<number> {
  const rows = await query<{ count: string }>(
    'SELECT COUNT(*) as count FROM conversations WHERE phone = $1',
    [phone]
  )
  return parseInt(rows[0]?.count ?? '0', 10)
}
