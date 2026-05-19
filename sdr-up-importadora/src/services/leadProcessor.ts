import { findOrCreateLead, updateLead } from '../models/lead'
import { saveMessage, getHistory } from '../models/conversation'
import { generateSDRResponse, classifyLead } from './ai'
import { sendTextMessage } from './whatsapp'
import { logger } from '../config/logger'
import { env } from '../config/env'

const HANDOFF_MARKERS = [
  'vou passar agora pro nosso comercial',
  'vou passar pro nosso comercial',
  'vou passar essas informações pro nosso comercial',
  'vou passar essas informações para nosso comercial',
  'vou passar para o nosso comercial',
  'vou passar pro comercial',
  'vou passar para o comercial',
  'vou já te conectar',
  'vou ja te conectar',
  'vou te conectar com nosso comercial',
  'vou já te conectar com nosso comercial',
  'vou ja te conectar com nosso comercial',
  'vou te conectar com o comercial',
  'vou encaminhar para nossa equipe',
  'vou encaminhar pra nossa equipe',
  'vou encaminhar essas informações',
  'vou repassar pro nosso comercial',
  'vou repassar para o nosso comercial',
]

const FOLLOWUP_MARKERS = [
  'vou simular pra voce',
  'vou simular para voce',
  'vou pedir pro comercial preparar',
  'vou encaminhar pra nossa equipe',
  'vou encaminhar para nossa equipe',
]

function containsHandoffMarker(text: string): boolean {
  const lower = text.toLowerCase()
  return HANDOFF_MARKERS.some(marker => lower.includes(marker))
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
      await notifySeller(phone, lead.name)
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

async function notifySeller(leadPhone: string, leadName: string | null): Promise<void> {
  const name = leadName ?? 'Sem nome'
  const message =
    `LEAD QUENTE DETECTADO!\n\n` +
    `Nome: ${name}\n` +
    `Telefone: ${leadPhone}\n\n` +
    `Esse lead demonstrou interesse real de compra.\n` +
    `Entre em contato agora!`

  await sendTextMessage(env.seller.whatsapp, message)
  logger.info(`Vendedor notificado sobre lead quente: ${leadPhone}`)
}
