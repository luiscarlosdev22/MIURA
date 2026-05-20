import axios from 'axios'
import { readFile } from 'fs/promises'
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

export async function sendAudio(phone: string, filepath: string): Promise<void> {
  if (env.whatsappProvider !== 'evolution') {
    logger.warn('sendAudio só funciona com Evolution provider hoje')
    return
  }

  try {
    const fileBuffer = await readFile(filepath)
    const base64 = fileBuffer.toString('base64')

    await axios.post(
      `${env.evolution.url}/message/sendWhatsAppAudio/${env.evolution.instance}`,
      { number: phone, audio: base64 },
      {
        headers: { apikey: env.evolution.apiKey, 'Content-Type': 'application/json' },
        timeout: 30_000,
      }
    )
    logger.info(`Áudio enviado para ${phone}`)
  } catch (err) {
    const error = err as Error & { response?: { data?: unknown } }
    logger.error(`Erro ao enviar áudio para ${phone}`, {
      message: error.message,
      response: (error as any).response?.data,
    })
    throw err
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
