import axios from 'axios'
import { env } from '../config/env'
import { logger } from '../config/logger'

export async function sendText(to: string, text: string): Promise<void> {
  if (env.whatsappProvider === 'evolution') {
    await sendEvolutionText(to, text)
  } else {
    await sendMetaText(to, text)
  }
}

// Alias mantido para compatibilidade com leadProcessor.ts
export async function sendTextMessage(to: string, text: string): Promise<void> {
  return sendText(to, text)
}

async function sendEvolutionText(to: string, text: string): Promise<void> {
  try {
    await axios.post(
      `${env.evolution.url}/message/sendText/${env.evolution.instance}`,
      { number: to, text },
      { headers: { apikey: env.evolution.apiKey } }
    )
    logger.info(`Mensagem enviada para ${to} via Evolution`)
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      logger.error('Erro ao enviar mensagem via Evolution', {
        status: error.response?.status,
        data: error.response?.data,
        to,
      })
    }
    throw error
  }
}

async function sendMetaText(to: string, text: string): Promise<void> {
  try {
    await axios.post(
      `https://graph.facebook.com/v20.0/${env.whatsapp.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body: text, preview_url: false },
      },
      {
        headers: {
          Authorization: `Bearer ${env.whatsapp.token}`,
          'Content-Type': 'application/json',
        },
      }
    )
    logger.info(`Mensagem enviada para ${to} via Meta`)
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      logger.error('Erro ao enviar mensagem via Meta', {
        status: error.response?.status,
        data: error.response?.data,
        to,
      })
    }
    throw error
  }
}

export async function markAsRead(messageId: string): Promise<void> {
  if (env.whatsappProvider !== 'meta') return
  try {
    await axios.post(
      `https://graph.facebook.com/v20.0/${env.whatsapp.phoneNumberId}/messages`,
      { messaging_product: 'whatsapp', status: 'read', message_id: messageId },
      {
        headers: {
          Authorization: `Bearer ${env.whatsapp.token}`,
          'Content-Type': 'application/json',
        },
      }
    )
  } catch {
    // nao critico
  }
}
