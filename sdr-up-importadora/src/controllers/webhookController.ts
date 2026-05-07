import { Request, Response } from 'express'
import { env } from '../config/env'
import { logger } from '../config/logger'
import { processIncomingMessage } from '../services/leadProcessor'
import { markAsRead } from '../services/whatsapp'

export async function verifyWebhook(req: Request, res: Response): Promise<void> {
  const mode = req.query['hub.mode'] as string
  const token = req.query['hub.verify_token'] as string
  const challenge = req.query['hub.challenge'] as string

  if (mode === 'subscribe' && token === env.whatsapp.verifyToken) {
    logger.info('Webhook verificado pela Meta com sucesso')
    res.status(200).send(challenge)
    return
  }

  logger.warn('Tentativa de verificacao com token invalido', { token })
  res.sendStatus(403)
}

export async function receiveWebhook(req: Request, res: Response): Promise<void> {
  res.sendStatus(200)

  const body = req.body
  if (body?.object !== 'whatsapp_business_account') return

  const entry = body.entry?.[0]
  const change = entry?.changes?.[0]
  const value = change?.value

  if (!value?.messages || value.messages.length === 0) return

  const message = value.messages[0]
  const contactName = value.contacts?.[0]?.profile?.name ?? null

  if (message.type !== 'text') {
    logger.debug(`Tipo de mensagem nao suportado: ${message.type}`)
    return
  }

  const phone = message.from
  const text = message.text.body
  const messageId = message.id

  logger.info(`Nova mensagem de ${phone}`, {
    name: contactName,
    preview: text.slice(0, 60),
  })

  await markAsRead(messageId)

  processIncomingMessage(phone, text).catch(err => {
    logger.error(`Erro ao processar mensagem de ${phone}`, { error: err.message })
  })
}

export function healthCheck(_req: Request, res: Response): void {
  res.json({
    status: 'ok',
    service: 'SDR UP Importadora',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  })
}
