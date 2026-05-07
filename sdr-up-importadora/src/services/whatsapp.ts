import axios from 'axios'
import { env } from '../config/env'
import { logger } from '../config/logger'

const BASE_URL = `https://graph.facebook.com/v20.0/${env.whatsapp.phoneNumberId}`

const headers = {
  Authorization: `Bearer ${env.whatsapp.token}`,
  'Content-Type': 'application/json',
}

export async function sendTextMessage(to: string, text: string): Promise<void> {
  try {
    await axios.post(
      `${BASE_URL}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body: text, preview_url: false },
      },
      { headers }
    )
    logger.info(`Mensagem enviada para ${to}`)
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      logger.error('Erro ao enviar mensagem WhatsApp', {
        status: error.response?.status,
        data: error.response?.data,
        to,
      })
    }
    throw error
  }
}

export async function markAsRead(messageId: string): Promise<void> {
  try {
    await axios.post(
      `${BASE_URL}/messages`,
      { messaging_product: 'whatsapp', status: 'read', message_id: messageId },
      { headers }
    )
  } catch {
    // nao critico
  }
}
