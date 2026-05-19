import fs from 'fs'
import OpenAI from 'openai'
import { env } from '../config/env'
import { logger } from '../config/logger'

const openai = new OpenAI({ apiKey: env.openai.apiKey })

export async function transcribeAudio(filePath: string): Promise<string> {
  try {
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: 'whisper-1',
      language: 'pt',
    })

    const text = transcription.text?.trim()
    logger.info('Audio transcrito com sucesso', { preview: text?.slice(0, 60) })
    return text ?? ''
  } finally {
    try {
      fs.unlinkSync(filePath)
    } catch {
      logger.warn('Nao foi possivel remover arquivo temporario', { filePath })
    }
  }
}
