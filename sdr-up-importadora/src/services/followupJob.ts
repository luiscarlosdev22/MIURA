import { db } from '../config/database'
import { logger } from '../config/logger'
import { sendTextMessage } from './whatsapp'
import { saveMessage } from '../models/conversation'
import { followupMessage, FollowupReason } from './followupDetector'
import { PROPOSTA_MIURA, FECHO_PROPOSTA } from './proposta'

interface FollowupLead {
  phone: string
  name: string | null
  followup_reason: FollowupReason
  followup_count: number
}

// Janela horária por motivo (horário Brasília)
function isInWindow(hour: number, reason: FollowupReason): boolean {
  if (reason === 'proposta_enviada' || reason === 'enviar_proposta') {
    return hour >= 8 && hour <= 19
  }
  // Padrão (socio, pensar, pagamento, null): 9h-11h
  return hour >= 9 && hour <= 11
}

export async function runFollowupJob(): Promise<void> {
  const now = new Date()
  const horaSP = parseInt(
    now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false })
  )

  try {
    const result = await db.query<FollowupLead>(`
      SELECT phone, name, followup_reason, followup_count
      FROM leads
      WHERE followup_at IS NOT NULL
        AND followup_at <= NOW()
        AND seller_notified = FALSE
        AND (
          (followup_reason IN ('proposta_enviada', 'enviar_proposta') AND followup_count < 1)
          OR (COALESCE(followup_reason, '') NOT IN ('proposta_enviada', 'enviar_proposta') AND followup_count < 2)
        )
    `)

    if (result.rows.length === 0) {
      return
    }

    logger.info(`Verificando ${result.rows.length} lead(s) com follow-up pendente (hora SP: ${horaSP}h)`)

    for (const lead of result.rows) {
      // Verifica janela horária específica para o motivo do lead
      if (!isInWindow(horaSP, lead.followup_reason)) {
        continue
      }

      // Caso especial: enviar proposta automaticamente (1h após vídeos sem resposta)
      if (lead.followup_reason === 'enviar_proposta') {
        try {
          await sendTextMessage(lead.phone, PROPOSTA_MIURA)
          await saveMessage(lead.phone, 'assistant', PROPOSTA_MIURA)
          await new Promise(resolve => setTimeout(resolve, 1500))
          await sendTextMessage(lead.phone, FECHO_PROPOSTA)
          await saveMessage(lead.phone, 'assistant', FECHO_PROPOSTA)

          // Agenda follow-up de proposta para o dia seguinte às 9h
          const tomorrow = new Date()
          tomorrow.setDate(tomorrow.getDate() + 1)
          tomorrow.setHours(9, 0, 0, 0)
          await db.query(
            `UPDATE leads
             SET followup_at = $1,
                 followup_reason = 'proposta_enviada',
                 followup_count = 0,
                 followup_sent_at = NOW()
             WHERE phone = $2`,
            [tomorrow, lead.phone]
          )

          logger.info(`Proposta enviada automaticamente (pós-vídeo 1h) para ${lead.phone}`)
        } catch (err) {
          logger.error(`Erro ao enviar proposta automática para ${lead.phone}`, { error: (err as Error).message })
        }
        continue
      }

      try {
        const attempt = lead.followup_count + 1
        const msg = followupMessage(lead.name, lead.followup_reason, attempt)
        await sendTextMessage(lead.phone, msg)

        if (lead.followup_reason === 'proposta_enviada') {
          // 1 única tentativa — encerra sem reagendar
          await db.query(
            `UPDATE leads
             SET followup_count = $1,
                 followup_at = NULL,
                 followup_sent_at = NOW()
             WHERE phone = $2`,
            [attempt, lead.phone]
          )
        } else if (attempt < 2) {
          // Outros motivos: 2ª tentativa em 5 dias
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
          // 2ª tentativa esgotada — marca FRIO
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

        logger.info(`Follow-up #${attempt} (${lead.followup_reason}) enviado para ${lead.phone}`)
      } catch (err) {
        logger.error(`Erro ao enviar follow-up para ${lead.phone}`, { error: (err as Error).message })
      }
    }
  } catch (err) {
    logger.error('Erro no job de follow-up', { error: (err as Error).message })
  }
}

export function startFollowupJob(): void {
  const TWO_MINUTES = 2 * 60 * 1000
  setInterval(() => {
    runFollowupJob().catch(err => {
      logger.error('Falha no setInterval do follow-up', { error: err.message })
    })
  }, TWO_MINUTES)
  logger.info('Job de follow-up iniciado (executa a cada 2 minutos, janela varia por motivo)')
}
