import fs from 'fs'
import path from 'path'
import axios from 'axios'
import { env } from '../config/env'
import { logger } from '../config/logger'

export interface DownloadedMedia {
  filePath: string
  durationSeconds: number
}

export async function downloadAudioFromEvolution(data: {
  key: { id: string; remoteJid: string; fromMe: boolean }
  message: Record<string, unknown>
  messageType: string
}): Promise<DownloadedMedia> {
  const { url, apiKey, instance } = env.evolution

  const response = await axios.post<{ base64: string }>(
    `${url}/chat/getBase64FromMediaMessage/${instance}`,
    {
      message: { key: data.key, message: data.message, messageType: data.messageType },
      convertToMp4: false,
    },
    {
      headers: { apikey: apiKey },
      timeout: 30_000,
    }
  )

  const base64 = response.data?.base64
  if (!base64) throw new Error('Evolution nao retornou base64 para o audio')

  // Strip data URI prefix if present (data:audio/ogg;base64,...)
  const raw = base64.includes(',') ? base64.split(',')[1] : base64
  const buffer = Buffer.from(raw, 'base64')

  const tmpPath = path.join('/tmp', `audio_${Date.now()}_${Math.random().toString(36).slice(2)}.ogg`)
  fs.writeFileSync(tmpPath, buffer)

  // Duration from WhatsApp audio metadata (seconds field)
  const audioMsg = (data.message?.audioMessage ?? data.message?.pttMessage ?? {}) as Record<string, unknown>
  const durationSeconds = typeof audioMsg.seconds === 'number' ? audioMsg.seconds : 0

  logger.info('Audio baixado da Evolution API', { tmpPath, durationSeconds })

  return { filePath: tmpPath, durationSeconds }
}
