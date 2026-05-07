import { findOrCreateLead, updateLead } from '../models/lead'
import { saveMessage, getHistory } from '../models/conversation'
import { generateSDRResponse, classifyLead } from './ai'
import { sendTextMessage } from './whatsapp'
import { logger } from '../config/logger'
import { env } from '../config/env'

export async function processIncomingMessage(phone: string, text: string): Promise<void> {
  const lead = await findOrCreateLead(phone)
  logger.info(`Mensagem recebida de ${phone}`, { text: text.slice(0, 50) })

  const history = await getHistory(phone, 10)
  const reply = await generateSDRResponse(history, text)

  await saveMessage(phone, 'user', text)
  await saveMessage(phone, 'assistant', reply)

  const userMessages = history.filter(m => m.role === 'user').length + 1
  if (userMessages % 4 === 0 || userMessages === 6) {
    const updatedHistory = [...history, { role: 'user' as const, content: text }]
    const classification = await classifyLead(updatedHistory)

    logger.info(`Lead ${phone} classificado como: ${classification}`)
    await updateLead(phone, { status: classification })

    if (classification === 'QUENTE' && !lead.seller_notified && env.seller.whatsapp) {
      await notifySeller(phone, lead.name)
      await updateLead(phone, { seller_notified: true })
    }
  }

  await sendTextMessage(phone, reply)
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
