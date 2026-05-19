import { db } from '../config/database'
import { logger } from '../config/logger'
import { sendTextMessage } from './whatsapp'
import { followupMessage, FollowupReason } from './followupDetector'

interface FollowupLead {
  phone: string
  name: string | null
  followup_reason: FollowupReason
  followup_count: number
}

export async function runFollowupJob(): Promise<void> {
  const now = new Date()
  const horaSP = parseInt(
    now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false })
  )

  // Só roda entre 9h e 11h (horário Brasília)
  if (horaSP < 9 || horaSP >= 11) {
    return
  }

  try {
    const result = await db.query<FollowupLead>(`
      SELECT phone, name, followup_reason, followup_count
      FROM leads
      WHERE followup_at IS NOT NULL
        AND followup_at <= NOW()
        AND seller_notified = FALSE
        AND followup_count < 2
    `)

    if (result.rows.length === 0) {
      return
    }

    logger.info(`Executando follow-up para ${result.rows.length} lead(s)`)

    for (const lead of result.rows) {
      try {
        const attempt = lead.followup_count + 1
        const msg = followupMessage(lead.name, lead.followup_reason, attempt)
        await sendTextMessage(lead.phone, msg)

        if (attempt < 2) {
          const nextAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
          await db.query(
            `UPDATE leads
             SET followup_count = $1,
                 followup_at = $2,
                 followup_sent_at = NOW()
             WHERE phone = $3`,
            [attempt, nextAt, lead.phone]
          )
        } else {
          await db.query(
            `UPDATE leads
             SET followup_count = $1,
                 followup_at = NULL,
                 status = 'FRIO',
                 followup_sent_at = NOW()
             WHERE phone = $2`,
            [attempt, lead.phone]
          )
        }

        logger.info(`Follow-up #${attempt} enviado para ${lead.phone}`)
      } catch (err) {
        logger.error(`Erro ao enviar follow-up para ${lead.phone}`, { error: (err as Error).message })
      }
    }
  } catch (err) {
    logger.error('Erro no job de follow-up', { error: (err as Error).message })
  }
}

export function startFollowupJob(): void {
  const ONE_HOUR = 60 * 60 * 1000
  setInterval(() => {
    runFollowupJob().catch(err => {
      logger.error('Falha no setInterval do follow-up', { error: err.message })
    })
  }, ONE_HOUR)
  logger.info('Job de follow-up iniciado (executa a cada 1 hora, dispara entre 9h-11h)')
}
