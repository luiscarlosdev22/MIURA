import { buildHandoffBriefing, buildNewLeadNotification } from './handoffBriefing'
import { detectFollowupReason } from './followupDetector'
import { findOrCreateLead, updateLead, Lead } from '../models/lead'
import { saveMessage, getHistory } from '../models/conversation'
import { generateSDRResponse, classifyLead } from './ai'
import { sendTextMessage } from './whatsapp'
import { logger } from '../config/logger'
import { env } from '../config/env'

const HANDOFF_REGEX = /\b(vou|passo|encaminho|encaminhar|repasso|repassar|passar|conectar|conectando|conecto)\b[^.!?]{0,80}\b(comercial|vendedor|equipe|nosso time|atendimento humano)\b/i

const FOLLOWUP_MARKERS = [
  'vou simular pra voce',
  'vou simular para voce',
  'vou pedir pro comercial preparar',
  'vou encaminhar pra nossa equipe',
  'vou encaminhar para nossa equipe',
]

function containsHandoffMarker(text: string): boolean {
  return HANDOFF_REGEX.test(text)
}

function containsFollowupMarker(text: string): boolean {
  const lower = text.toLowerCase()
  return FOLLOWUP_MARKERS.some(marker => lower.includes(marker))
}

export async function processIncomingMessage(
  phone: string,
  text: string,
  name?: string | null
): Promise<void> {
  if (!phone.startsWith('55') || phone.length < 12 || phone.length > 13) {
    logger.info(`Mensagem ignorada (nao parece numero brasileiro): ${phone}`)
    return
  }

  const lead = await findOrCreateLead(phone, name ?? undefined)

  // Notifica vendedor quando lead é recém-criado (criado nos últimos 5 segundos)
  const isNewLead = lead.created_at && (Date.now() - new Date(lead.created_at).getTime()) < 5000
  if (isNewLead && env.seller.whatsapp) {
    try {
      const notif = buildNewLeadNotification(phone, lead.name, text)
      await sendTextMessage(env.seller.whatsapp, notif)
      logger.info(`Vendedor notificado sobre novo lead: ${phone}`)
    } catch (err) {
      logger.error(`Erro ao notificar novo lead ${phone}`, { error: (err as Error).message })
    }
  }

  if (lead.seller_notified) {
    await saveMessage(phone, 'user', text)
    logger.info(`Lead ${phone} ja esta com humano. SDR silenciado.`)
    return
  }

  logger.info(`Mensagem recebida de ${phone}`, { text: text.slice(0, 50) })

  if (text === '[MIDIA_NAO_TEXTO]') {
    await saveMessage(phone, 'user', '[lead enviou audio/imagem]')
    const reply =
      'Oi! Recebi sua mensagem mas consigo te responder mais rapido por texto. Pode me escrever o que voce quer saber?'
    await saveMessage(phone, 'assistant', reply)
    await sendTextMessage(phone, reply)
    return
  }

  // Detecta se a mensagem do usuário indica que ele vai sumir temporariamente
  const followupReason = detectFollowupReason(text)
  if (followupReason && !lead.seller_notified) {
    const followupAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
    await updateLead(phone, {
      followup_at: followupAt,
      followup_reason: followupReason,
      followup_count: 0,
    })
    logger.info(`Follow-up agendado para ${phone}`, { reason: followupReason, at: followupAt })
  }

  // Se o lead voltou a falar e tinha follow-up pendente, cancela
  if (lead.followup_at && !followupReason) {
    await updateLead(phone, {
      followup_at: null,
      followup_reason: null,
    })
    logger.info(`Follow-up cancelado para ${phone} (lead voltou a conversar)`)
  }

  const history = await getHistory(phone, 10)
  const reply = await generateSDRResponse(history, text, lead.name)

  await saveMessage(phone, 'user', text)

  const parts = reply.split('[[SPLIT]]').map(p => p.trim()).filter(p => p.length > 0)
  const savedReply = parts.join('\n\n')
  await saveMessage(phone, 'assistant', savedReply)

  // Envia a resposta ANTES de qualquer hand-off para garantir que o lead recebe a despedida
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, 1200 + Math.random() * 1300))
    }
    await sendTextMessage(phone, parts[i])
  }

  if (containsHandoffMarker(reply)) {
    logger.info(`Hand-off detectado na resposta da Julia para ${phone}`)
    await updateLead(phone, { status: 'QUENTE' })
    if (!lead.seller_notified && env.seller.whatsapp) {
      await notifySeller(phone, lead)
      await updateLead(phone, { seller_notified: true })
    }
    return
  }

  if (containsFollowupMarker(reply)) {
    const followupAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
    logger.info(`Follow-up agendado para ${phone} em ${followupAt.toISOString()}`)
    await updateLead(phone, { awaiting_followup_at: followupAt })
    return
  }

  // Classificação de fundo (MORNO/FRIO apenas) — não notifica vendedor
  const userMessages = history.filter(m => m.role === 'user').length + 1
  if (userMessages % 4 === 0 || userMessages === 6) {
    const updatedHistory = [...history, { role: 'user' as const, content: text }]
    const classification = await classifyLead(updatedHistory)
    logger.info(`Lead ${phone} classificado como: ${classification}`)
    if (classification !== 'QUENTE') {
      await updateLead(phone, { status: classification })
    }
  }
}

async function notifySeller(leadPhone: string, lead: Lead): Promise<void> {
  const briefingMsg = await buildHandoffBriefing(leadPhone, lead)
  await sendTextMessage(env.seller.whatsapp, briefingMsg)
  logger.info(`Vendedor notificado sobre lead quente: ${leadPhone}`)
}
